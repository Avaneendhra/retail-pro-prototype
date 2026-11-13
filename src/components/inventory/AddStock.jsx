import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../lib/settings';
import { inr, pname } from '../../lib/format';
import { CATEGORIES } from '../../data/seed';
import { downscale } from '../../lib/invoiceParser';
import {
  isPlausibleBarcode, lookupBarcode, parseLabelText, guessCategory, frameFromVideo, dataUrlToFile, composeName, strictMatch,
} from '../../lib/productLookup';

const FORMATS = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE];
const READER_ID = 'unified-reader';
const HELPER_ID = 'unified-scan-helper';

const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

export default function AddStock() {
  const { t } = useTranslation();
  const { products, findByBarcode, byId, addProduct, receiveStock } = useInventory();
  const { showToast } = useToast();
  const [settings] = useSettings();
  const useClaude = !!settings.apiKey;

  const [live, setLive] = useState(false);
  const [stage, setStage] = useState(null);        // processing stage key
  const [result, setResult] = useState(null);      // review draft
  const [recent, setRecent] = useState([]);
  const [lastCode, setLastCode] = useState('');

  const scannerRef = useRef(null);
  const workerRef = useRef(null);
  const confirmRef = useRef({ code: '', count: 0 });
  const busyRef = useRef(false);
  const resultRef = useRef(null);
  resultRef.current = result;
  const fileRef = useRef(null);


  /* ── OCR worker (created once, reused for speed) ── */
  const ocr = useCallback(async (dataUrl) => {
    if (!workerRef.current) {
      const { createWorker } = await import('tesseract.js');
      workerRef.current = await createWorker('eng');
    }
    const { data } = await workerRef.current.recognize(dataUrl);
    return data.text;
  }, []);

  useEffect(() => () => {
    workerRef.current?.terminate?.();
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) s.stop().then(() => s.clear()).catch(() => {});
  }, []);

  /* ── Read the label: Claude when a key is saved, otherwise on-device OCR ── */
  const readLabel = useCallback(async (dataUrl) => {
    if (useClaude) {
      try {
        const { identifyWithClaude } = await import('../../lib/claudeProduct');
        const r = await identifyWithClaude({ apiKey: settings.apiKey, dataUrl, products });
        return { ...r, engine: 'claude' };
      } catch (err) {
        showToast(t('invoice.errClaude', { msg: err.message }), 'error');
      }
    }
    try {
      const parsed = parseLabelText(await ocr(dataUrl));
      return { ...parsed, category: guessCategory(parsed.name), engine: 'ocr' };
    } catch {
      return null;
    }
  }, [useClaude, settings.apiKey, products, ocr, showToast, t]);

  /* ── Decode a barcode from a still image ── */
  const decodeImage = useCallback(async (dataUrl) => {
    try {
      const helper = new Html5Qrcode(HELPER_ID, { formatsToSupport: FORMATS, verbose: false });
      const res = await helper.scanFileV2(dataUrlToFile(dataUrl), false);
      try { helper.clear(); } catch { /* ignore */ }
      const fmt = res?.result?.format?.formatName || '';
      return isPlausibleBarcode(res.decodedText, fmt) ? res.decodedText : '';
    } catch {
      return '';
    }
  }, []);

  /* ── The whole pipeline: barcode + label + product databases -> one draft ── */
  const identify = useCallback(async ({ barcode = '', dataUrl = null }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      let code = barcode;
      if (!code && dataUrl) { setStage('stageBarcode'); code = await decodeImage(dataUrl); }
      if (code) setLastCode(code);

      let existing = code ? findByBarcode(code) : null;
      const sources = [];
      if (code) sources.push('barcode');
      if (existing) {
        setResult({ mode: 'existing', productId: existing.id, qty: 1, sources: [...sources, 'catalog'], image: dataUrl });
        return;
      }

      setStage(code ? 'stageLookup' : 'stageLabel');
      const [db, label] = await Promise.all([
        code ? lookupBarcode(code) : Promise.resolve(null),
        dataUrl ? readLabel(dataUrl) : Promise.resolve(null),
      ]);

      // The label can still reveal an existing product: printed barcode, Claude match, or a confident name match
      if (!code && label?.barcode) { code = label.barcode; existing = findByBarcode(code); }
      if (!existing && label?.matchedId) existing = byId(label.matchedId);
      if (!existing && !db && label?.name) existing = strictMatch(products, label.name, label.size);
      const labelSource = label?.engine === 'claude' ? 'claude' : 'label';
      if (existing) {
        setResult({ mode: 'existing', productId: existing.id, qty: 1, sources: [...sources, labelSource, 'catalog'], image: dataUrl, mrp: label?.mrp || 0 });
        return;
      }

      if (db) sources.push('database');
      if (label?.name || label?.mrp) sources.push(labelSource);
      const name = db?.name || (label?.name ? composeName(label.brand, label.name, label.size) : '');
      setResult({
        mode: 'new',
        name,
        category: db?.category && db.category !== 'other' ? db.category : (label?.category && label.category !== 'other' ? label.category : guessCategory(name)),
        price: label?.mrp || '',
        mrpFromLabel: !!label?.mrp,
        barcode: code || '',
        code: '',
        min: 5,
        qty: 1,
        image: db?.image || dataUrl,
        sources,
        note: !name ? 'noDetails' : (code && !db ? 'notFound' : ''),
      });
    } finally {
      setStage(null);
      busyRef.current = false;
    }
  }, [decodeImage, findByBarcode, byId, readLabel, products]);

  /* ── Live camera: continuous barcode detection ── */
  const onDecode = useCallback((text, res) => {
    if (busyRef.current || resultRef.current) return;
    const fmt = res?.result?.format?.formatName || '';
    if (!isPlausibleBarcode(text, fmt)) return;
    // two identical reads in a row before accepting, to avoid misreads
    const c = confirmRef.current;
    c.count = c.code === text ? c.count + 1 : 1;
    c.code = text;
    if (c.count < 2) return;
    confirmRef.current = { code: '', count: 0 };
    if (navigator.vibrate) navigator.vibrate(60);
    const frame = frameFromVideo(document.querySelector(`#${READER_ID} video`));
    try { scannerRef.current?.pause(true); } catch { /* not scanning */ }
    identify({ barcode: text, dataUrl: frame });
  }, [identify]);

  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const start = async () => {
    try {
      const scanner = new Html5Qrcode(READER_ID, { formatsToSupport: FORMATS, verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 12, aspectRatio: 4 / 3,
          qrbox: (w, h) => ({ width: Math.floor(w * 0.86), height: Math.floor(h * 0.5) }),
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        },
        (text, res) => onDecodeRef.current(text, res),
        () => {},
      );
      setLive(true);
    } catch {
      scannerRef.current = null;
      showToast(t('addStock.errCamera'), 'error');
    }
  };

  const stop = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    setLive(false);
    if (s) { try { await s.stop(); s.clear(); } catch { /* already stopped */ } }
  };

  const resume = () => { try { scannerRef.current?.resume(); } catch { /* not paused */ } };

  /* "Scan" — read barcode and label together from the current frame */
  const scanNow = () => {
    const frame = frameFromVideo(document.querySelector(`#${READER_ID} video`));
    if (!frame) return;
    try { scannerRef.current?.pause(true); } catch { /* ignore */ }
    identify({ dataUrl: frame });
  };

  const onUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    let url = await readFile(file);
    try { url = await downscale(url, 1600, 0.92); } catch { /* keep original */ }
    try { scannerRef.current?.pause(true); } catch { /* ignore */ }
    identify({ dataUrl: url });
  };

  const discard = () => { setResult(null); resume(); };

  const save = () => {
    if (!result) return;
    const qty = Math.max(1, parseInt(result.qty, 10) || 1);
    if (result.mode === 'existing') {
      const p = byId(result.productId);
      receiveStock([{ productId: p.id, qty }]);
      showToast(t('addStock.toastStock', { qty, name: pname(p) }), 'success');
      setRecent(r => [{ name: pname(p), qty, isNew: false }, ...r].slice(0, 12));
    } else {
      const name = result.name.trim();
      if (!name) { showToast(t('addStock.errName'), 'error'); return; }
      if (!(Number(result.price) > 0)) { showToast(t('addStock.errPrice'), 'error'); return; }
      if (result.barcode && findByBarcode(result.barcode)) {
        // barcode typed by hand matches an existing product: add stock to it instead
        const p = findByBarcode(result.barcode);
        receiveStock([{ productId: p.id, qty }]);
        showToast(t('addStock.toastStock', { qty, name: pname(p) }), 'success');
      } else {
        addProduct({
          name, barcode: result.barcode || undefined, code: result.code.trim().toUpperCase() || undefined,
          price: Number(result.price), category: result.category, quantity: qty, min: Number(result.min) || 5,
        });
        showToast(t('addStock.toastAdded', { name }), 'success');
      }
      setRecent(r => [{ name, qty, isNew: true }, ...r].slice(0, 12));
    }
    setResult(null);
    resume();
  };

  const set = (patch) => setResult(r => ({ ...r, ...patch }));
  const existingProduct = result?.mode === 'existing' ? byId(result.productId) : null;
  const manual = () => {
    try { scannerRef.current?.pause(true); } catch { /* ignore */ }
    setResult({ mode: 'new', name: '', category: 'grocery', price: '', barcode: '', code: '', min: 5, qty: 1, image: null, sources: [] });
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('addStock.title')}</h1>
        <p className="page-subtitle">{t('addStock.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
        {/* ── One scanner ── */}
        <div className="card p-0 overflow-hidden">
          <div className="relative bg-black aspect-[3/4] sm:aspect-[4/3] scanner-stage">
            <div id={READER_ID} className="absolute inset-0" />

            {!live && !stage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-[var(--accent-blue)] text-[var(--on-accent)] flex items-center justify-center">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.8} d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M8 9v6M11 9v6M14 9v6M17 9v6" /></svg>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <button className="btn btn-cta" onClick={start}>{t('addStock.startCamera')}</button>
                  <button className="btn btn-ghost !text-white !bg-white/10 !border-white/20" onClick={() => fileRef.current?.click()}>{t('addStock.upload')}</button>
                </div>
                <p className="text-sm text-white/60 max-w-sm leading-relaxed">{t('addStock.tip')}</p>
              </div>
            )}

            {live && !stage && !result && (
              <span className="absolute top-4 left-4 status-pill is-online bg-black/60 backdrop-blur !border-white/10">
                <span className="dot" />{t('addStock.looking')}
              </span>
            )}

            {stage && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="w-12 h-12 border-4 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
                <p className="text-white font-semibold text-lg">{t(`addStock.${stage}`)}</p>
                {lastCode && stage !== 'stageBarcode' && <p className="font-mono text-white/60 text-sm">{lastCode}</p>}
              </div>
            )}

            {live && (
              <div className="absolute bottom-0 inset-x-0 p-4 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent">
                <button className="btn btn-sm !text-white !border-white/30 border" onClick={stop}>{t('addStock.stop')}</button>
                <button className="btn btn-cta flex-1" onClick={scanNow} disabled={!!stage || !!result}>{t('addStock.scan')}</button>
                <button className="icon-pill !bg-black/40 !border-white/20 !text-white" onClick={() => fileRef.current?.click()} aria-label={t('addStock.upload')} title={t('addStock.upload')}>
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.6-4.6a2 2 0 012.8 0L16 16m-2-2l1.6-1.6a2 2 0 012.8 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </button>
              </div>
            )}
          </div>
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <span className={`badge ${useClaude ? 'badge-success' : 'badge-info'}`}>{useClaude ? t('addStock.engineClaude') : t('addStock.engineOcr')}</span>
            <button className="text-sm font-semibold text-[var(--primary)]" onClick={manual}>{t('addStock.manual')}</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
          <div id={HELPER_ID} className="hidden" />
        </div>

        {/* ── Details to check ── */}
        <div className="space-y-6">
          {!result && (
            <div className="card p-8 text-center text-[var(--text-secondary)]">
              <p>{t('addStock.empty')}</p>
            </div>
          )}

          {result && (
            <div className="card p-6 animate-in" data-testid="scan-result">
              <div className="flex items-start gap-4 mb-5">
                {result.image && (
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white shrink-0 border border-[var(--border)]">
                    <img src={result.image} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="eyebrow mb-1.5">{result.mode === 'existing' ? t('addStock.existingTitle') : t('addStock.reviewTitle')}</p>
                  <h2 className="font-display text-[22px] font-bold tracking-tight leading-tight">
                    {existingProduct ? pname(existingProduct) : (result.name || t('addStock.newProduct'))}
                  </h2>
                  {result.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {result.sources.map(s => <span key={s} className="badge badge-info">{t(`addStock.sources.${s}`)}</span>)}
                    </div>
                  )}
                </div>
              </div>

              {existingProduct ? (
                <>
                  <dl className="grid grid-cols-3 gap-4 card-inset p-4 mb-5 text-sm">
                    <div><dt className="eyebrow text-[10px] mb-1">{t('common.stock')}</dt><dd className="font-mono font-semibold">{existingProduct.quantity}</dd></div>
                    <div><dt className="eyebrow text-[10px] mb-1">{t('common.price')}</dt><dd className="font-mono font-semibold">{inr(existingProduct.price)}</dd></div>
                    <div><dt className="eyebrow text-[10px] mb-1">{t('common.code')}</dt><dd className="font-mono font-semibold">{existingProduct.code}</dd></div>
                  </dl>
                  {result.mrp > 0 && result.mrp !== existingProduct.price && (
                    <p className="text-sm text-[var(--warning)] mb-4">{t('addStock.mrpDiffers', { mrp: inr(result.mrp) })}</p>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="col-span-2">
                    <label className="field-label" htmlFor="as-name">{t('addStock.name')}</label>
                    <input id="as-name" className="form-input" value={result.name} onChange={e => set({ name: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="as-price">{t('addStock.price')}</label>
                    <input id="as-price" className="form-input font-mono" inputMode="decimal" value={result.price} onChange={e => set({ price: e.target.value.replace(/[^\d.]/g, ''), mrpFromLabel: false })} />
                    {result.mrpFromLabel && <p className="text-[11px] text-[var(--success)] mt-1">{t('addStock.mrpHint')}</p>}
                  </div>
                  <div>
                    <label className="field-label" htmlFor="as-cat">{t('common.category')}</label>
                    <select id="as-cat" className="form-input" value={result.category} onChange={e => set({ category: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="as-bc">{t('addStock.barcodeField')}</label>
                    <input id="as-bc" className="form-input font-mono" inputMode="numeric" value={result.barcode} onChange={e => set({ barcode: e.target.value.trim() })} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="as-code">{t('addStock.code')}</label>
                    <input id="as-code" className="form-input font-mono uppercase" placeholder={(result.name || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()} value={result.code} onChange={e => set({ code: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="as-min">{t('addStock.min')}</label>
                    <input id="as-min" className="form-input font-mono" inputMode="numeric" value={result.min} onChange={e => set({ min: e.target.value.replace(/\D/g, '') })} />
                  </div>
                </div>
              )}

              {result.note && <p className="text-sm text-[var(--text-secondary)] mb-4">{t(`addStock.${result.note}`)}</p>}

              <div className="flex flex-wrap items-end gap-3">
                <div className="w-32">
                  <label className="field-label" htmlFor="as-qty">{t('addStock.quantity')}</label>
                  <div className="stepper !flex w-full justify-between">
                    <button onClick={() => setResult(r => ({ ...r, qty: Math.max(1, (parseInt(r.qty, 10) || 1) - 1) }))} aria-label="−">−</button>
                    <input id="as-qty" value={result.qty} inputMode="numeric" onChange={e => set({ qty: e.target.value.replace(/\D/g, '') })} />
                    <button onClick={() => setResult(r => ({ ...r, qty: (parseInt(r.qty, 10) || 0) + 1 }))} aria-label="+">+</button>
                  </div>
                </div>
                <button className="btn btn-cta flex-1" onClick={save}>
                  {result.mode === 'existing' ? t('addStock.addQty', { qty: parseInt(result.qty, 10) || 1 }) : t('addStock.add')}
                </button>
                <button className="btn btn-secondary" onClick={discard}>{t('addStock.discard')}</button>
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <div className="card p-6">
              <h3 className="eyebrow mb-4">{t('addStock.recent')}</h3>
              <div className="divide-y divide-[var(--border)]">
                {recent.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className={`badge ${r.isNew ? 'badge-success' : 'badge-info'}`}>{r.isNew ? t('addStock.newBadge') : t('addStock.stockBadge')}</span>
                    <span className="flex-1 truncate font-medium">{r.name}</span>
                    <span className="font-mono text-[var(--success)]">+{r.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
