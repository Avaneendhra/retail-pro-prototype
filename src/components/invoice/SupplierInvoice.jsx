import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../lib/settings';
import { pname, fmtDate } from '../../lib/format';
import { parseInvoiceText, makeMatcher, downscale, sampleInvoiceImage } from '../../lib/invoiceParser';
import Modal from '../common/Modal';

const HISTORY_KEY = 'sr2_invoices';
const loadHistory = () => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } };

const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

/* Live camera capture */
function CameraModal({ open, onClose, onCapture }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError('');
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(tr => tr.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      })
      .catch(() => setError(t('addStock.errCamera')));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      streamRef.current = null;
    };
  }, [open, t]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    onCapture(c.toDataURL('image/jpeg', 0.92));
  };

  return (
    <Modal open={open} onClose={onClose} title={t('invoice.captureTitle')} width={720}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-cta" onClick={capture} disabled={!!error}>{t('invoice.capture')}</button>
      </>}>
      <div className="rounded-2xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
        {error ? <p className="text-sm text-[var(--danger)] p-6 text-center">{error}</p>
          : <video ref={videoRef} playsInline muted className="w-full h-full object-contain" />}
      </div>
    </Modal>
  );
}

export default function SupplierInvoice() {
  const { t } = useTranslation();
  const { products, receiveStock } = useInventory();
  const { showToast } = useToast();
  const [settings] = useSettings();
  const useClaude = !!settings.apiKey;

  const [step, setStep] = useState('upload');   // upload | extracting | review | done
  const [image, setImage] = useState(null);
  const [engine, setEngine] = useState(useClaude ? 'claude' : 'ocr');
  const [progress, setProgress] = useState(0);
  const [header, setHeader] = useState({ supplier: '', invoiceNo: '', date: '' });
  const [rows, setRows] = useState([]);
  const [changes, setChanges] = useState([]);
  const [drag, setDrag] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const fileRef = useRef(null);

  const match = useMemo(() => makeMatcher(products), [products]);
  const sortedProducts = useMemo(() => [...products].sort((a, b) => pname(a).localeCompare(pname(b))), [products]);

  const toRows = (items) => items.map((it, i) => {
    let productId = it.matchedId || '';
    let confident = !!it.matchedId;
    if (!productId) {
      const m = match(it.name);
      productId = m.product?.id || '';
      confident = m.confident;
    }
    return {
      key: `${Date.now()}-${i}`, raw: it.raw || it.name, name: it.name, qty: it.qty, unitPrice: it.unitPrice || 0,
      target: productId || 'new', confident: confident && !!productId,
      newPrice: it.unitPrice ? Math.round(it.unitPrice * 1.15) : '',
    };
  });

  const runOcr = async (dataUrl) => {
    setEngine('ocr');
    const { default: Tesseract } = await import('tesseract.js');
    const res = await Tesseract.recognize(dataUrl, 'eng', {
      logger: m => { if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100)); },
    });
    return parseInvoiceText(res.data.text);
  };

  const handleImage = async (rawDataUrl) => {
    setStep('extracting'); setProgress(0);
    let dataUrl = rawDataUrl;
    try { dataUrl = await downscale(rawDataUrl, 1600); } catch { /* keep original */ }
    setImage(dataUrl);
    let result = null;
    if (useClaude) {
      setEngine('claude');
      try {
        const { extractWithClaude } = await import('../../lib/claudeInvoice');
        result = await extractWithClaude({ apiKey: settings.apiKey, dataUrl, products });
      } catch (err) {
        showToast(t('invoice.errClaude', { msg: err.message }), 'error');
      }
    }
    try {
      if (!result) result = await runOcr(dataUrl);
    } catch {
      showToast(t('invoice.errRead'), 'error');
      result = { supplier: '', invoiceNo: '', date: '', items: [] };
    }
    setHeader({ supplier: result.supplier, invoiceNo: result.invoiceNo, date: result.date });
    setRows(toRows(result.items));
    setStep('review');
  };

  const onFiles = async (files) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    handleImage(await readFile(file));
  };

  const updateRow = (key, patch) => setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  const activeRows = rows.filter(r => r.target !== 'skip' && Number(r.qty) > 0 && (r.target !== 'new' || r.name.trim()));

  const confirm = () => {
    const items = activeRows.map(r => r.target === 'new'
      ? { newProduct: { name: r.name.trim(), price: Number(r.newPrice) || 0, category: 'other' }, qty: Number(r.qty) }
      : { productId: r.target, qty: Number(r.qty) });
    const ch = receiveStock(items);
    setChanges(ch);
    const entry = { ...header, count: ch.length, units: ch.reduce((s, c) => s + c.qty, 0), at: Date.now() };
    const next = [entry, ...history].slice(0, 10);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setStep('done');
  };

  const reset = () => { setStep('upload'); setImage(null); setRows([]); setChanges([]); setHeader({ supplier: '', invoiceNo: '', date: '' }); };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="page-header">
        <h1 className="page-title">{t('invoice.title')}</h1>
        <p className="page-subtitle">{t('invoice.subtitle')}</p>
      </div>

      {step === 'upload' && (
        <>
          <div className={`dropzone card ${drag ? 'drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}>
            <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[var(--accent-blue)] text-[var(--on-accent)] flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
            </div>
            <h2 className="font-display text-[24px] font-bold tracking-tight">{t('invoice.uploadTitle')}</h2>
            <p className="text-[var(--text-secondary)] mt-2">{t('invoice.drop')}</p>
            <div className="flex flex-wrap justify-center gap-3 mt-7">
              <button className="btn btn-cta" onClick={() => setCameraOpen(true)}>{t('invoice.camera')}</button>
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>{t('invoice.choose')}</button>
              <button className="btn btn-secondary" onClick={() => handleImage(sampleInvoiceImage())}>{t('invoice.sample')}</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
            <p className="text-xs text-[var(--text-muted)] mt-6">{t('invoice.formats')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4 px-2 text-sm text-[var(--text-secondary)]">
            <span className={`badge ${useClaude ? 'badge-success' : 'badge-info'}`}>{useClaude ? t('invoice.engineClaude') : t('invoice.engineOcr')}</span>
            {!useClaude && <span>{t('invoice.engineSwitch')}</span>}
          </div>

          {history.length > 0 && (
            <section className="card p-6 mt-6">
              <h2 className="eyebrow mb-4">{t('invoice.history')}</h2>
              <div className="divide-y divide-[var(--border)]">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="font-medium flex-1 truncate">{h.supplier || '—'}</span>
                    <span className="font-mono text-[var(--text-secondary)]">{h.invoiceNo || '—'}</span>
                    <span className="text-[var(--text-muted)] w-28 text-right">{fmtDate(h.at)}</span>
                    <span className="font-mono w-16 text-right">+{h.units}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {step === 'extracting' && (
        <div className="card p-8 grid md:grid-cols-[220px_1fr] gap-8 items-center">
          {image && <img src={image} alt="" className="w-full rounded-2xl border border-[var(--border)] max-h-72 object-contain bg-white" />}
          <div>
            <span className="badge badge-info mb-4">{engine === 'claude' ? t('invoice.engineClaude') : t('invoice.engineOcr')}</span>
            <h2 className="font-display text-[26px] font-bold tracking-tight">{t('invoice.extracting')}</h2>
            <p className="text-[var(--text-secondary)] mt-2 mb-6">{engine === 'claude' ? t('invoice.readingClaude') : `${t('invoice.readingOcr')}${progress ? ` · ${progress}%` : ''}`}</p>
            <div className="progress-line" />
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-6">
          <div className="card card-accent-blue p-6 flex items-start gap-4">
            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
            <div>
              <h2 className="font-display text-[20px] font-bold tracking-tight">{t('invoice.reviewTitle')}</h2>
              <p className="mt-1 text-[var(--text-secondary)]">{t('invoice.reviewNote')}</p>
            </div>
          </div>

          <div className="card p-6">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-4 items-end">
              <div><label className="field-label" htmlFor="inv-sup">{t('invoice.supplier')}</label>
                <input id="inv-sup" className="form-input" value={header.supplier} onChange={e => setHeader(h => ({ ...h, supplier: e.target.value }))} /></div>
              <div><label className="field-label" htmlFor="inv-no">{t('invoice.invoiceNo')}</label>
                <input id="inv-no" className="form-input font-mono" value={header.invoiceNo} onChange={e => setHeader(h => ({ ...h, invoiceNo: e.target.value }))} /></div>
              <div><label className="field-label" htmlFor="inv-date">{t('invoice.date')}</label>
                <input id="inv-date" className="form-input font-mono" value={header.date} onChange={e => setHeader(h => ({ ...h, date: e.target.value }))} /></div>
              {image && <img src={image} alt="" className="hidden md:block h-[46px] w-16 object-cover rounded-xl border border-[var(--border)] bg-white" />}
            </div>
          </div>

          <div className="card overflow-hidden">
            {rows.length === 0 && <p className="p-6 text-[var(--text-secondary)]">{t('invoice.noItems')}</p>}
            {rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>{t('invoice.extracted')}</th><th>{t('invoice.matchedTo')}</th><th className="w-28">{t('common.qty')}</th><th className="w-36">{t('common.stock')}</th><th className="w-10" /></tr></thead>
                  <tbody>
                    {rows.map(r => {
                      const p = products.find(x => x.id === r.target);
                      const skipped = r.target === 'skip';
                      return (
                        <tr key={r.key} className={skipped ? 'opacity-40' : ''}>
                          <td className="whitespace-normal">
                            <input className="form-input !py-2" value={r.name} onChange={e => updateRow(r.key, { name: e.target.value })} aria-label={t('invoice.extracted')} />
                            {r.raw && r.raw !== r.name && <p className="text-[11px] font-mono text-[var(--text-muted)] mt-1 truncate max-w-[260px]">{r.raw}</p>}
                          </td>
                          <td className="whitespace-normal">
                            <select className="form-input !py-2" value={r.target} onChange={e => updateRow(r.key, { target: e.target.value, confident: true })} aria-label={t('invoice.matchedTo')}>
                              {sortedProducts.map(sp => <option key={sp.id} value={sp.id}>{pname(sp)} · {sp.code}</option>)}
                              <option value="new">+ {t('invoice.createNew')}</option>
                              <option value="skip">{t('invoice.skip')}</option>
                            </select>
                            {r.target === 'new' && (
                              <input className="form-input !py-2 mt-2 font-mono" inputMode="numeric" placeholder={t('invoice.newPrice')} value={r.newPrice}
                                onChange={e => updateRow(r.key, { newPrice: e.target.value.replace(/[^\d.]/g, '') })} aria-label={t('invoice.newPrice')} />
                            )}
                            {!r.confident && !skipped && <span className="badge badge-warning mt-2">{t('invoice.confidenceLow')}</span>}
                          </td>
                          <td><input className="form-input !py-2 font-mono text-center" inputMode="numeric" value={r.qty}
                            onChange={e => updateRow(r.key, { qty: e.target.value.replace(/\D/g, '') })} aria-label={t('common.qty')} /></td>
                          <td className="font-mono text-sm">
                            {skipped ? '—' : p ? <>{p.quantity} <span className="text-[var(--text-muted)]">→</span> <b>{p.quantity + (Number(r.qty) || 0)}</b></>
                              : <>0 <span className="text-[var(--text-muted)]">→</span> <b>{Number(r.qty) || 0}</b></>}
                          </td>
                          <td>
                            <button className="btn-icon" onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))} aria-label={t('common.remove')}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" /></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="p-4 border-t border-[var(--border)]">
              <button className="btn btn-secondary btn-sm" onClick={() => setRows(prev => [...prev, { key: `m${Date.now()}`, raw: '', name: '', qty: 1, unitPrice: 0, target: sortedProducts[0]?.id || 'new', confident: true, newPrice: '' }])}>
                + {t('invoice.addLine')}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button className="btn btn-secondary" onClick={reset}>{t('common.cancel')}</button>
            <button className="btn btn-cta" onClick={confirm} disabled={!activeRows.length}>{t('invoice.confirmCount', { count: activeRows.length })}</button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="card p-8">
          <span className="status-dot mb-5" />
          <h2 className="font-display text-[30px] font-bold tracking-tight">{t('invoice.doneTitle')}</h2>
          <p className="text-[var(--text-secondary)] mt-2 mb-6">{t('invoice.doneSub', { supplier: header.supplier || '—', no: header.invoiceNo || '—' })}</p>
          <div className="card-inset p-4 mb-6 divide-y divide-[var(--border)]">
            {changes.map(ch => (
              <div key={ch.productId} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex-1 truncate font-medium">{pname(ch)} {ch.isNew && <span className="badge badge-info ml-2">{t('common.new')}</span>}</span>
                <span className="font-mono text-[var(--text-muted)]">{ch.before}</span>
                <span className="text-[var(--text-muted)]">→</span>
                <span className="font-mono font-semibold w-12">{ch.after}</span>
                <span className="font-mono text-xs text-[var(--success)] w-12 text-right">+{ch.qty}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-cta" onClick={reset}>{t('invoice.another')}</button>
        </div>
      )}

      <CameraModal open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={(url) => { setCameraOpen(false); handleImage(url); }} />
    </div>
  );
}
