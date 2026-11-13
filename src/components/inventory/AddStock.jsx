import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../lib/settings';
import { inr, pname } from '../../lib/format';
import { CATEGORIES } from '../../data/seed';
import { downscale } from '../../lib/invoiceParser';
import {
  isPlausibleBarcode, lookupBarcode, parseLabelText, guessCategory, frameFromVideo, dataUrlToFile, composeName, strictMatch, barcodeVariants,
} from '../../lib/productLookup';

const FORMATS = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE];
const READER_ID = 'unified-reader';
const HELPER_ID = 'unified-scan-helper';
const LABEL_EVERY_MS = 1800;   // how often the camera frame is checked for a label
const SAME_ITEM_GAP_MS = 4000; // the same product must leave the frame this long before it counts again
const AUTO_KEY = 'sr2_auto_add';

const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

/** Does OCR'd label text look like a real product (not background noise)? */
const looksLikeProduct = (l) => {
  if (!l?.name) return false;
  const words = l.name.split(/\s+/).filter(w => /\p{L}{3,}/u.test(w));
  return words.length >= 2 && (l.mrp > 0 || !!l.size || !!l.brand || !!l.barcode);
};

const itemKey = (draft) => draft.productId || draft.barcode || (draft.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export default function AddStock() {
  const { t } = useTranslation();
  const { products, findByBarcode, byId, receiveStock, revertStock } = useInventory();
  const { showToast } = useToast();
  const [settings] = useSettings();
  const useClaude = !!settings.apiKey;

  const [live, setLive] = useState(false);
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch { return true; } });
  const [stage, setStage] = useState(null);
  const [result, setResult] = useState(null);      // review draft (manual mode)
  const [flash, setFlash] = useState(null);        // last automatic add
  const [recent, setRecent] = useState([]);

  const scannerRef = useRef(null);
  const workerRef = useRef(null);
  const confirmRef = useRef({ code: '', count: 0 });
  const busyRef = useRef(false);
  const resultRef = useRef(null); resultRef.current = result;
  const autoRef = useRef(auto); autoRef.current = auto;
  const lastSeenRef = useRef({});                  // key -> last time it was in view
  const lastAddedRef = useRef({ key: '', at: 0 });
  const lastBarcodeAtRef = useRef(0);
  const productsRef = useRef(products); productsRef.current = products;
  const fileRef = useRef(null);

  useEffect(() => { try { localStorage.setItem(AUTO_KEY, auto ? 'on' : 'off'); } catch { /* ignore */ } }, [auto]);

  /* ── OCR worker, created once ── */
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

  /* ── Label reading: on-device OCR first; Claude for accurate details when a key is saved ── */
  const readLabel = useCallback(async (dataUrl, { quiet = false } = {}) => {
    let parsed = null;
    try { parsed = parseLabelText(await ocr(dataUrl)); } catch { parsed = null; }
    // In the automatic loop, only spend a Claude call when there is visible label text
    if (useClaude && (!quiet || (parsed && /\p{L}{4,}/u.test(parsed.name || '')))) {
      try {
        const { identifyWithClaude } = await import('../../lib/claudeProduct');
        const r = await identifyWithClaude({ apiKey: settings.apiKey, dataUrl, products: productsRef.current });
        if (r.name || r.barcode) return { ...r, engine: 'claude' };
      } catch (err) {
        if (!quiet) showToast(t('invoice.errClaude', { msg: err.message }), 'error');
      }
    }
    return parsed ? { ...parsed, category: guessCategory(parsed.name), engine: 'ocr' } : null;
  }, [useClaude, settings.apiKey, ocr, showToast, t]);

  const decodeImage = useCallback(async (dataUrl) => {
    // Try centre crops and a high-contrast copy: makes blurry camera frames decode reliably
    for (const variant of await barcodeVariants(dataUrl)) {
      try {
        const helper = new Html5Qrcode(HELPER_ID, { formatsToSupport: FORMATS, verbose: false });
        const res = await helper.scanFileV2(dataUrlToFile(variant), false);
        try { helper.clear(); } catch { /* ignore */ }
        const fmt = res?.result?.format?.formatName || '';
        if (isPlausibleBarcode(res.decodedText, fmt)) return res.decodedText;
      } catch { /* not found in this variant */ }
    }
    return '';
  }, []);

  /**
   * Identify a product from a barcode and/or a camera frame.
   * Returns a draft: { productId } for a known product, or new-product details, or null.
   */
  const identify = useCallback(async ({ barcode = '', dataUrl = null, quiet = false }) => {
    let code = barcode;
    if (!code && dataUrl) { if (!quiet) setStage('stageBarcode'); code = await decodeImage(dataUrl); }

    const known = code ? findByBarcode(code) : null;
    if (known) return { productId: known.id, barcode: code, sources: ['barcode', 'catalog'], image: dataUrl };

    if (!quiet || code) setStage(code ? 'stageLookup' : 'stageLabel');
    const [db, label] = await Promise.all([
      code ? lookupBarcode(code) : Promise.resolve(null),
      dataUrl ? readLabel(dataUrl, { quiet }) : Promise.resolve(null),
    ]);
    const labelSource = label?.engine === 'claude' ? 'claude' : 'label';

    if (!code && label?.barcode) {
      code = label.barcode;
      const p = findByBarcode(code);
      if (p) return { productId: p.id, barcode: code, sources: [labelSource, 'catalog'], image: dataUrl };
    }
    let existing = label?.matchedId ? byId(label.matchedId) : null;
    if (!existing && !db && label?.name) existing = strictMatch(productsRef.current, label.name, label.size);
    if (existing) return { productId: existing.id, barcode: code, sources: [labelSource, 'catalog'], image: dataUrl, mrp: label?.mrp || 0 };

    // In the automatic label loop, ignore frames that don't clearly show a product
    if (!code && !db && (label?.engine === 'ocr' ? !looksLikeProduct(label) : !label?.name)) return null;

    const sources = [];
    if (code) sources.push('barcode');
    if (db) sources.push('database');
    if (label?.name || label?.mrp) sources.push(labelSource);
    const name = db?.name || (label?.name ? composeName(label.brand, label.name, label.size) : '');
    return {
      name: name || (code ? t('addStock.placeholderName', { code: code.slice(-6) }) : ''),
      placeholder: !name,
      category: db?.category && db.category !== 'other' ? db.category : (label?.category && label.category !== 'other' ? label.category : guessCategory(name)),
      price: label?.mrp || 0,
      mrpFromLabel: !!label?.mrp,
      barcode: code || '',
      image: db?.image || dataUrl,
      sources,
    };
  }, [decodeImage, findByBarcode, byId, readLabel, t]);

  /* ── Add a draft to inventory (1 unit by default) ── */
  const commit = useCallback((draft, qty = 1) => {
    let changes;
    if (draft.productId) {
      changes = receiveStock([{ productId: draft.productId, qty }]);
    } else {
      const needsReview = draft.placeholder || !(Number(draft.price) > 0);
      changes = receiveStock([{
        newProduct: {
          name: draft.name.trim(), barcode: draft.barcode || undefined, code: draft.code?.trim().toUpperCase() || undefined,
          price: Number(draft.price) || 0, category: draft.category, min: Number(draft.min) || 5, needsReview,
        },
        qty,
      }]);
    }
    const ch = changes[0];
    if (!ch) return null;
    const entry = {
      productId: ch.productId, name: draft.productId ? pname(byId(draft.productId)) : draft.name, qty, isNew: !!ch.isNew,
      after: ch.after, price: draft.productId ? byId(draft.productId)?.price : Number(draft.price) || 0,
      needsReview: !draft.productId && (draft.placeholder || !(Number(draft.price) > 0)),
      sources: draft.sources, image: draft.image, changes, at: Date.now(),
    };
    setRecent(r => [entry, ...r].slice(0, 15));
    return entry;
  }, [receiveStock, byId]);

  /* ── One pass of the automatic pipeline ── */
  const handle = useCallback(async (input) => {
    if (busyRef.current || resultRef.current) return;
    busyRef.current = true;
    try {
      const draft = await identify(input);
      if (!draft) {
        if (!input.quiet) showToast(t('addStock.errRead'), 'error');
        return;
      }
      const key = itemKey(draft);
      const now = Date.now();
      const seenGap = now - (lastSeenRef.current[key] || 0);
      lastSeenRef.current[key] = now;
      // Same product still in front of the camera: don't count it twice
      if (input.quiet && lastAddedRef.current.key === key && seenGap < SAME_ITEM_GAP_MS) return;

      if (autoRef.current) {
        const entry = commit(draft, 1);
        if (entry) {
          lastAddedRef.current = { key: entry.productId, at: now };
          lastSeenRef.current[entry.productId] = now;
          setFlash(entry);
          if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
        }
      } else {
        try { scannerRef.current?.pause(true); } catch { /* ignore */ }
        setResult({ ...draft, qty: 1, min: 5, code: '' });
      }
    } finally {
      setStage(null);
      busyRef.current = false;
    }
  }, [identify, commit, showToast, t]);

  const handleRef = useRef(handle); handleRef.current = handle;

  /* ── Live barcode detection ── */
  const onDecode = useCallback((text, res) => {
    const fmt = res?.result?.format?.formatName || '';
    if (!isPlausibleBarcode(text, fmt)) return;
    lastBarcodeAtRef.current = Date.now();
    const c = confirmRef.current;
    c.count = c.code === text ? c.count + 1 : 1;
    c.code = text;
    // keep refreshing "last seen" for the product already added, so it isn't re-added while held still
    const p = findByBarcode(text);
    const key = p ? p.id : text;
    if (lastAddedRef.current.key === key && Date.now() - (lastSeenRef.current[key] || 0) < SAME_ITEM_GAP_MS) {
      lastSeenRef.current[key] = Date.now();
      return;
    }
    if (c.count < 2 || busyRef.current) return;
    confirmRef.current = { code: '', count: 0 };
    const frame = frameFromVideo(document.querySelector(`#${READER_ID} video`), 1400);
    handleRef.current({ barcode: text, dataUrl: frame, quiet: true });
  }, [findByBarcode]);
  const onDecodeRef = useRef(onDecode); onDecodeRef.current = onDecode;

  /* ── Automatic label reading for products without a (visible) barcode ── */
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (busyRef.current || resultRef.current) return;
      if (Date.now() - lastBarcodeAtRef.current < 2500) return; // a barcode is in view, let that path handle it
      const frame = frameFromVideo(document.querySelector(`#${READER_ID} video`), 1100);
      if (frame) handleRef.current({ dataUrl: frame, quiet: true });
    }, LABEL_EVERY_MS);
    return () => clearInterval(id);
  }, [live]);

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

  const onUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    let url = await readFile(file);
    try { url = await downscale(url, 1600, 0.92); } catch { /* keep original */ }
    handle({ dataUrl: url, quiet: false });
  };

  /* Flash card actions */
  const undo = () => {
    if (!flash) return;
    revertStock(flash.changes);
    setRecent(r => r.filter(x => x !== flash));
    lastAddedRef.current = { key: '', at: 0 };
    showToast(t('addStock.undone', { name: flash.name }), 'success');
    setFlash(null);
  };
  const plusOne = () => {
    if (!flash) return;
    const ch = receiveStock([{ productId: flash.productId, qty: 1 }]);
    const next = { ...flash, qty: flash.qty + 1, after: ch[0]?.after ?? flash.after, changes: [...flash.changes, ...ch.map(c => ({ ...c, isNew: false }))] };
    setRecent(r => r.map(x => (x === flash ? next : x)));
    setFlash(next);
  };

  /* Manual review mode */
  const discard = () => { setResult(null); resume(); };
  const saveReview = () => {
    if (!result) return;
    const qty = Math.max(1, parseInt(result.qty, 10) || 1);
    if (!result.productId && !result.name.trim()) { showToast(t('addStock.errName'), 'error'); return; }
    const entry = commit(result, qty);
    if (entry) showToast(entry.isNew ? t('addStock.toastAdded', { name: entry.name }) : t('addStock.toastStock', { qty, name: entry.name }), 'success');
    setResult(null);
    resume();
  };
  const set = (patch) => setResult(r => ({ ...r, ...patch }));
  const manual = () => {
    try { scannerRef.current?.pause(true); } catch { /* ignore */ }
    setResult({ name: '', category: 'grocery', price: '', barcode: '', code: '', min: 5, qty: 1, image: null, sources: [] });
  };
  const reviewProduct = result?.productId ? byId(result.productId) : null;

  return (
    <div>
      <div className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t('addStock.title')}</h1>
          <p className="page-subtitle">{auto ? t('addStock.subtitleAuto') : t('addStock.subtitle')}</p>
        </div>
        <label className="auto-toggle">
          <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span>
            <span className="block font-semibold">{t('addStock.autoAdd')}</span>
            <span className="block text-xs text-[var(--text-muted)]">{auto ? t('addStock.autoOn') : t('addStock.autoOff')}</span>
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
        {/* ── Camera ── */}
        <div className="card p-0 overflow-hidden">
          <div className="relative bg-black aspect-[3/4] sm:aspect-[4/3] scanner-stage">
            <div id={READER_ID} className="absolute inset-0" />

            {!live && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-[var(--accent-blue)] text-[var(--on-accent)] flex items-center justify-center">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.8} d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M8 9v6M11 9v6M14 9v6M17 9v6" /></svg>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <button className="btn btn-cta" onClick={start}>{t('addStock.startCamera')}</button>
                  <button className="btn btn-ghost !text-white !bg-white/10 !border-white/20" onClick={() => fileRef.current?.click()}>{t('addStock.upload')}</button>
                </div>
                <p className="text-sm text-white/60 max-w-sm leading-relaxed">{t('addStock.tipAuto')}</p>
              </div>
            )}

            {live && !result && (
              <span className="absolute top-4 left-4 status-pill is-online bg-black/60 backdrop-blur !border-white/10">
                <span className="dot" />{auto ? t('addStock.lookingAuto') : t('addStock.looking')}
              </span>
            )}

            {stage && (
              <span className="absolute top-4 right-4 status-pill bg-black/60 backdrop-blur !border-white/10 text-white">
                <span className="w-3 h-3 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />{t(`addStock.${stage}`)}
              </span>
            )}

            {/* Automatic add confirmation */}
            {flash && live && (
              <div key={flash.at} className="absolute inset-x-4 bottom-20 auto-flash">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-[var(--success)] text-black flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">+{flash.qty} {flash.name}</p>
                    <p className="text-xs text-white/60">{flash.isNew ? t('addStock.newBadge') : t('addStock.inStock', { qty: flash.after })}{flash.needsReview ? ` · ${t('addStock.needsDetails')}` : ''}</p>
                  </div>
                  <button className="btn btn-sm !bg-white/10 !text-white" onClick={plusOne}>+1</button>
                  <button className="btn btn-sm !bg-white/10 !text-white" onClick={undo}>{t('addStock.undo')}</button>
                </div>
              </div>
            )}

            {live && (
              <div className="absolute bottom-0 inset-x-0 p-4 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent">
                <button className="btn btn-sm !text-white !border-white/30 border" onClick={stop}>{t('addStock.stop')}</button>
                <span className="flex-1 text-center text-xs text-white/60">{t('addStock.hold')}</span>
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

        {/* ── Right column ── */}
        <div className="space-y-6">
          {result && (
            <div className="card p-6 animate-in" data-testid="scan-result">
              <div className="flex items-start gap-4 mb-5">
                {result.image && (
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white shrink-0 border border-[var(--border)]">
                    <img src={result.image} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="eyebrow mb-1.5">{reviewProduct ? t('addStock.existingTitle') : t('addStock.reviewTitle')}</p>
                  <h2 className="font-display text-[22px] font-bold tracking-tight leading-tight">{reviewProduct ? pname(reviewProduct) : (result.name || t('addStock.newProduct'))}</h2>
                  {result.sources?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">{result.sources.map(s => <span key={s} className="badge badge-info">{t(`addStock.sources.${s}`)}</span>)}</div>
                  )}
                </div>
              </div>
              {!reviewProduct && (
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="col-span-2">
                    <label className="field-label" htmlFor="as-name">{t('addStock.name')}</label>
                    <input id="as-name" className="form-input" value={result.name} onChange={e => set({ name: e.target.value, placeholder: false })} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="as-price">{t('addStock.price')}</label>
                    <input id="as-price" className="form-input font-mono" inputMode="decimal" value={result.price || ''} onChange={e => set({ price: e.target.value.replace(/[^\d.]/g, ''), mrpFromLabel: false })} />
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
                    <label className="field-label" htmlFor="as-min">{t('addStock.min')}</label>
                    <input id="as-min" className="form-input font-mono" inputMode="numeric" value={result.min} onChange={e => set({ min: e.target.value.replace(/\D/g, '') })} />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-32">
                  <label className="field-label" htmlFor="as-qty">{t('addStock.quantity')}</label>
                  <div className="stepper !flex w-full justify-between">
                    <button onClick={() => setResult(r => ({ ...r, qty: Math.max(1, (parseInt(r.qty, 10) || 1) - 1) }))} aria-label="−">−</button>
                    <input id="as-qty" value={result.qty} inputMode="numeric" onChange={e => set({ qty: e.target.value.replace(/\D/g, '') })} />
                    <button onClick={() => setResult(r => ({ ...r, qty: (parseInt(r.qty, 10) || 0) + 1 }))} aria-label="+">+</button>
                  </div>
                </div>
                <button className="btn btn-cta flex-1" onClick={saveReview}>{t('addStock.add')}</button>
                <button className="btn btn-secondary" onClick={discard}>{t('addStock.discard')}</button>
              </div>
            </div>
          )}

          <div className="card p-6" data-testid="recent-adds">
            <div className="flex items-center justify-between mb-4">
              <h3 className="eyebrow">{t('addStock.recent')}</h3>
              {recent.length > 0 && <span className="font-mono text-sm text-[var(--text-secondary)]">+{recent.reduce((s, r) => s + r.qty, 0)}</span>}
            </div>
            {recent.length === 0 && <p className="text-[var(--text-secondary)]">{auto ? t('addStock.emptyAuto') : t('addStock.empty')}</p>}
            <div className="divide-y divide-[var(--border)]">
              {recent.map((r) => (
                <div key={r.at} className="flex items-center gap-3 py-3 text-sm">
                  {r.image ? <img src={r.image} alt="" className="w-10 h-10 rounded-xl object-cover bg-white shrink-0" /> : <span className="w-10 h-10 rounded-xl bg-[var(--surface-2)] shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{r.name}</p>
                    <p className="text-xs text-[var(--text-muted)] flex flex-wrap gap-x-2">
                      <span>{r.isNew ? t('addStock.newBadge') : t('addStock.stockBadge')}</span>
                      {r.price > 0 && <span className="font-mono">{inr(r.price)}</span>}
                      {r.sources?.map(s => <span key={s}>· {t(`addStock.sources.${s}`)}</span>)}
                    </p>
                  </div>
                  {r.needsReview
                    ? <Link to={`/inventory?focus=${r.productId}`} className="badge badge-warning">{t('addStock.setDetails')}</Link>
                    : null}
                  {flash && r.at === flash.at && <button className="btn-icon !px-2 text-xs font-semibold" onClick={undo}>{t('addStock.undo')}</button>}
                  <span className="font-mono text-[var(--success)] w-10 text-right">+{r.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
