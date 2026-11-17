import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../lib/settings';
import { inr, pname } from '../../lib/format';
import { CATEGORIES } from '../../data/seed';
import { downscale } from '../../lib/invoiceParser';
import { lookupBarcode, lookupPrice, parseLabel, guessCategory, frameFromVideo, strictMatch } from '../../lib/productLookup';
import { identifyProduct } from '../../lib/identifyProduct';
import { loadProductList } from '../../lib/productList';
import { parseBarcode } from '../../lib/barcodeData';
import { expiryInfo, readDateInput, dateInputText } from '../../lib/expiry';
import { openCamera, closeCamera, setTorch, scanVideoFrame, scanImage, loadImage, ocrLabel, warmUpBarcodeEngine } from '../../lib/scanEngine';

const LABEL_EVERY_MS = 1800;   // how often the camera frame is checked for a label
const BARCODE_FIRST_MS = 3500; // the label is only read after this long without a barcode in view
const SAME_ITEM_GAP_MS = 4000; // the same product must leave the frame this long before it counts again
const AUTO_KEY = 'sr2_auto_add';

const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

const itemKey = (draft) => draft.productId || draft.barcode || (draft.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The batch and dates of a scanned pack, ready to save. */
const packOf = (draft) => ({ batch: (draft.batch || '').trim(), mfgDate: draft.mfgDate || '', expiryDate: draft.expiryDate || '' });
/** Review-card text inputs for those dates. */
const inputsOf = (draft) => ({ batch: draft.batch || '', mfgText: dateInputText(draft.mfgDate), expiryText: dateInputText(draft.expiryDate) });

function packLine(t, pack) {
  const parts = [];
  if (pack.mfgDate) parts.push(t('addStock.mfgShort', { date: dateInputText(pack.mfgDate) }));
  if (pack.expiryDate) {
    const info = expiryInfo(pack.expiryDate);
    parts.push(info?.status === 'expired' ? t('addStock.expiredShort', { date: dateInputText(pack.expiryDate) }) : t('addStock.expiryShort', { date: dateInputText(pack.expiryDate) }));
  }
  if (pack.batch) parts.push(t('addStock.batchShort', { batch: pack.batch }));
  return parts.join(' · ');
}

/** One pack detail on the review card, with where its value came from. */
function PackField({ id, label, source, value, placeholder, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="form-input font-mono" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {source && <p className="text-[11px] text-[var(--success)] mt-1 truncate">{t(source === 'barcode' ? 'addStock.fromBarcode' : 'addStock.fromLabel')}</p>}
    </div>
  );
}

export default function AddStock() {
  const { t } = useTranslation();
  const { products, findByBarcode, byId, receiveStock, revertStock, updateProduct } = useInventory();
  const { showToast } = useToast();
  const [settings] = useSettings();
  const useClaude = !!settings.apiKey;

  const [live, setLive] = useState(false);
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch { return true; } });
  const [stage, setStage] = useState(null);
  const [result, setResult] = useState(null);      // review draft (manual mode)
  const [flash, setFlash] = useState(null);        // last automatic add
  const [recent, setRecent] = useState([]);

  const videoRef = useRef(null);
  const camRef = useRef(null);                     // { stream, track, hasTorch }
  const [torch, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const workerRef = useRef(null);
  const confirmRef = useRef({ code: '', count: 0 });
  const busyRef = useRef(false);
  const resultRef = useRef(null); resultRef.current = result;
  const autoRef = useRef(auto); autoRef.current = auto;
  const lastSeenRef = useRef({});                  // key -> last time it was in view
  const lastAddedRef = useRef({ key: '', at: 0 });
  const lastBarcodeAtRef = useRef(0);
  const cameraOnAtRef = useRef(0);
  const productsRef = useRef(products); productsRef.current = products;
  const fileRef = useRef(null);
  const priceRef = useRef(null);
  const [priceError, setPriceError] = useState(false);
  const [readingPrice, setReadingPrice] = useState(false);

  useEffect(() => { try { localStorage.setItem(AUTO_KEY, auto ? 'on' : 'off'); } catch { /* ignore */ } }, [auto]);

  /* ── OCR worker, created once ── */
  const ocr = useCallback(async (dataUrl) => {
    if (!workerRef.current) {
      const { createWorker } = await import('tesseract.js');
      workerRef.current = await createWorker('eng');
    }
    return ocrLabel(workerRef.current, await loadImage(dataUrl));
  }, []);

  useEffect(() => {
    warmUpBarcodeEngine();
    loadProductList(); // start downloading the product list before the first scan
    return () => {
      workerRef.current?.terminate?.();
      closeCamera(camRef.current?.stream);
      camRef.current = null;
    };
  }, []);

  /* ── Label reading: on-device OCR first; Claude for accurate details when a key is saved ── */
  const readLabel = useCallback(async (dataUrl, { quiet = false } = {}) => {
    let parsed = null;
    try { parsed = parseLabel(await ocr(dataUrl)); } catch { parsed = null; }
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

  /**
   * Barcode first: the code from the camera (or decoded from the photo) decides the
   * product and any batch, dates or price it carries; databases give the name; the
   * label is read only for what is still missing.
   */
  const identify = useCallback(async ({ barcode = '', format = '', dataUrl = null, quiet = false }) => {
    if (!quiet) setStage(barcode ? 'stageLookup' : 'stageBarcode');
    return identifyProduct({ barcode, format, dataUrl, quiet }, {
      decodeImage: async (url) => { try { return await scanImage(await loadImage(url)); } catch { return null; } },
      lookup: (code) => { if (!quiet) setStage('stageLookup'); return lookupBarcode(code); },
      lookupPrice: (code) => lookupPrice(code),
      findListed: async (code) => (await loadProductList())?.findByBarcode(code) || null,
      findListedByName: async (name, size) => (await loadProductList())?.findByName(name, size) || null,
      readLabel: (url, opts) => { if (!quiet) setStage('stageLabel'); return readLabel(url, opts); },
      findByBarcode, byId,
      matchByName: (name, size) => strictMatch(productsRef.current, name, size),
    });
  }, [findByBarcode, byId, readLabel]);

  /* ── Add a draft to inventory (1 unit by default) ── */
  const commit = useCallback((draft, qty = 1) => {
    let changes;
    if (draft.productId) {
      if (Number(draft.price) > 0 && !(byId(draft.productId)?.price > 0)) updateProduct(draft.productId, { price: Number(draft.price), needsReview: false });
      changes = receiveStock([{ productId: draft.productId, qty, details: packOf(draft) }], { reason: 'scan' });
    } else {
      const needsReview = draft.placeholder || !(Number(draft.price) > 0);
      changes = receiveStock([{
        newProduct: {
          name: draft.name.trim(), barcode: draft.barcode || undefined, code: draft.code?.trim().toUpperCase() || undefined,
          price: Number(draft.price) || 0, category: draft.category, min: Number(draft.min) || 5, needsReview, ...packOf(draft),
        },
        qty,
      }], { reason: 'scan' });
    }
    const ch = changes[0];
    if (!ch) return null;
    const entry = {
      productId: ch.productId, name: draft.productId ? pname(byId(draft.productId)) : draft.name, qty, isNew: !!ch.isNew,
      after: ch.after, price: draft.productId ? byId(draft.productId)?.price : Number(draft.price) || 0,
      needsReview: !draft.productId && (draft.placeholder || !(Number(draft.price) > 0)),
      sources: draft.sources, image: draft.image, changes, at: Date.now(), ...packOf(draft),
    };
    setRecent(r => [entry, ...r].slice(0, 15));
    return entry;
  }, [receiveStock, byId, updateProduct]);

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
      if (draft.placeholder) draft.name = t('addStock.placeholderName', { code: (draft.barcode || '').slice(-6) });
      if (!draft.category) draft.category = guessCategory(draft.name);
      const key = itemKey(draft);
      const now = Date.now();
      const seenGap = now - (lastSeenRef.current[key] || 0);
      lastSeenRef.current[key] = now;
      // Same product still in front of the camera: don't count it twice
      if (input.quiet && lastAddedRef.current.key === key && seenGap < SAME_ITEM_GAP_MS) return;

      // Full details are required: a product with no price (or no name) stops for the shopkeeper.
      // A product matched only by the name on its label is shown for a quick check first.
      const incomplete = draft.needsPrice || draft.placeholder || draft.confirm;
      if (autoRef.current && !incomplete) {
        const entry = commit(draft, 1);
        if (entry) {
          lastAddedRef.current = { key: entry.productId, at: now };
          lastSeenRef.current[entry.productId] = now;
          setFlash(entry);
          if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
        }
      } else {
        if (draft.placeholder) draft.name = '';
        setPriceError(false);
        setResult({ ...draft, price: draft.price || '', qty: 1, min: 5, code: '', ...inputsOf(draft) });
        if (navigator.vibrate) navigator.vibrate(60);
      }
    } finally {
      setStage(null);
      busyRef.current = false;
    }
  }, [identify, commit, showToast, t]);

  const handleRef = useRef(handle); handleRef.current = handle;

  /* ── Live barcode detection on our own video, several times a second ── */
  const onBarcode = useCallback((text, format = '') => {
    lastBarcodeAtRef.current = Date.now();
    const c = confirmRef.current;
    c.count = c.code === text ? c.count + 1 : 1;
    c.code = text;
    // keep refreshing "last seen" for the product already added, so it isn't re-added while held still
    const p = findByBarcode(parseBarcode(text, format).code);
    const key = p ? p.id : text;
    if (lastAddedRef.current.key === key && Date.now() - (lastSeenRef.current[key] || 0) < SAME_ITEM_GAP_MS) {
      lastSeenRef.current[key] = Date.now();
      return;
    }
    if (c.count < 2 || busyRef.current) return;
    confirmRef.current = { code: '', count: 0 };
    const frame = frameFromVideo(videoRef.current, 1400);
    handleRef.current({ barcode: text, format, dataUrl: frame, quiet: true });
  }, [findByBarcode]);
  const onBarcodeRef = useRef(onBarcode); onBarcodeRef.current = onBarcode;

  useEffect(() => {
    if (!live) return;
    let stopped = false, attempt = 0;
    const loop = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && !resultRef.current) {
        const hit = await scanVideoFrame(v, attempt++).catch(() => null);
        if (hit && !stopped) onBarcodeRef.current(hit.text, hit.format);
      }
      if (!stopped) setTimeout(loop, 90);
    };
    loop();
    return () => { stopped = true; };
  }, [live]);

  /* ── Automatic label reading for products without a (visible) barcode ── */
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (busyRef.current || resultRef.current) return;
      const now = Date.now();
      // Barcode first: give the barcode reader a head start, and never read a label while a barcode is in view.
      if (now - cameraOnAtRef.current < BARCODE_FIRST_MS || now - lastBarcodeAtRef.current < BARCODE_FIRST_MS) return;
      const frame = frameFromVideo(videoRef.current, 1400);
      if (frame) handleRef.current({ dataUrl: frame, quiet: true });
    }, LABEL_EVERY_MS);
    return () => clearInterval(id);
  }, [live]);

  const start = async () => {
    try {
      const cam = await openCamera(videoRef.current);
      camRef.current = cam;
      setHasTorch(cam.hasTorch);
      cameraOnAtRef.current = Date.now();
      setLive(true);
    } catch {
      showToast(t('addStock.errCamera'), 'error');
    }
  };

  const stop = () => {
    closeCamera(camRef.current?.stream);
    camRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    if (camRef.current?.track && await setTorch(camRef.current.track, !torch)) setTorchOn(!torch);
  };

  const resume = () => {};

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
    const ch = receiveStock([{ productId: flash.productId, qty: 1 }], { reason: 'scan' });
    const next = { ...flash, qty: flash.qty + 1, after: ch[0]?.after ?? flash.after, changes: [...flash.changes, ...ch.map(c => ({ ...c, isNew: false }))] };
    setRecent(r => r.map(x => (x === flash ? next : x)));
    setFlash(next);
  };

  /* Manual review mode */
  const discard = () => { setResult(null); setPriceError(false); resume(); };

  /** Reads the MRP (and dates) from whatever side of the pack is in front of the camera now. */
  const readPriceFromCamera = async () => {
    const frame = frameFromVideo(videoRef.current, 1600);
    if (!frame || readingPrice) return;
    setReadingPrice(true);
    try {
      const label = await readLabel(frame, { quiet: false });
      setResult((r) => {
        if (!r) return r;
        const patch = {};
        const fs = { ...r.fieldSources };
        if (label?.mrp > 0) { patch.price = String(label.mrp); patch.mrpFromLabel = true; delete fs.price; }
        if (label?.mfgDate && !r.mfgText) { patch.mfgText = dateInputText(label.mfgDate); fs.mfgDate = 'label'; }
        if (label?.expiryDate && !r.expiryText) { patch.expiryText = dateInputText(label.expiryDate); fs.expiryDate = 'label'; }
        if (label?.batch && !r.batch) { patch.batch = label.batch; fs.batch = 'label'; }
        if (!r.productId && !r.name && label?.name) patch.name = label.name;
        return { ...r, ...patch, fieldSources: fs };
      });
      if (label?.mrp > 0) setPriceError(false);
      else showToast(t('addStock.priceNotRead'), 'error');
    } finally {
      setReadingPrice(false);
    }
  };
  const saveReview = () => {
    if (!result) return;
    const qty = Math.max(1, parseInt(result.qty, 10) || 1);
    if (!result.productId && !result.name.trim()) { showToast(t('addStock.errName'), 'error'); return; }
    if ((!result.productId || result.needsPrice) && !(Number(result.price) > 0)) {
      setPriceError(true);
      priceRef.current?.focus();
      showToast(t('addStock.errPrice'), 'error');
      return;
    }
    const mfgDate = readDateInput(result.mfgText);
    const expiryDate = readDateInput(result.expiryText);
    if (mfgDate === null || expiryDate === null) { showToast(t('addStock.errDate'), 'error'); return; }
    const entry = commit({ ...result, mfgDate, expiryDate }, qty);
    if (entry) showToast(entry.isNew ? t('addStock.toastAdded', { name: entry.name }) : t('addStock.toastStock', { qty, name: entry.name }), 'success');
    setResult(null);
    resume();
  };
  const set = (patch) => setResult(r => ({ ...r, ...patch }));
  const manual = () => {
    setPriceError(false);
    setResult({ name: '', category: 'grocery', price: '', barcode: '', code: '', min: 5, qty: 1, image: null, sources: [], fieldSources: {}, batch: '', mfgText: '', expiryText: '' });
  };
  const reviewProduct = result?.productId ? byId(result.productId) : null;
  const priceSource = result?.fieldSources?.price;
  const priceField = result && (
    <div className="col-span-2 sm:col-span-1">
      <label className="field-label" htmlFor="as-price">{t('addStock.price')} *</label>
      <input id="as-price" ref={priceRef} className="form-input font-mono" inputMode="decimal" required aria-required="true"
        aria-invalid={priceError || undefined} aria-describedby="as-price-hint" style={priceError ? { borderColor: 'var(--danger)' } : undefined}
        value={result.price || ''} onChange={e => { setPriceError(false); set({ price: e.target.value.replace(/[^\d.]/g, ''), mrpFromLabel: false, fieldSources: { ...result.fieldSources, price: undefined } }); }} />
      <p id="as-price-hint" className={`text-[11px] mt-1 ${priceError ? 'text-[var(--danger)]' : priceSource || result.mrpFromLabel ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
        {priceSource === 'barcode' ? t('addStock.fromBarcode')
          : priceSource === 'prices' ? t('addStock.fromPrices')
          : priceSource === 'list' ? t('addStock.fromList')
            : result.mrpFromLabel ? t('addStock.mrpHint')
              : !(Number(result.price) > 0) ? t('addStock.priceRequired') : ''}
      </p>
      {live && !(priceSource === 'barcode') && (
        <button type="button" className="text-xs font-semibold text-[var(--primary)] mt-1.5" onClick={readPriceFromCamera} disabled={readingPrice}>
          {readingPrice ? t('addStock.stageLabel') : t('addStock.readPrice')}
        </button>
      )}
    </div>
  );

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
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
            {live && <div className="scan-window" aria-hidden="true"><span /></div>}

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
                    {(flash.mfgDate || flash.expiryDate || flash.batch) && <p className="text-xs text-white/80 mt-0.5">{packLine(t, flash)}</p>}
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
                {hasTorch && (
                  <button className={`icon-pill !border-white/20 ${torch ? '!bg-[var(--accent-blue)] !text-black' : '!bg-black/40 !text-white'}`} onClick={toggleTorch} aria-label={t('addStock.torch')} title={t('addStock.torch')}>
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 2h6l-1 6h3l-7 14 1-9H8l1-11z" /></svg>
                  </button>
                )}
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
              {result.needsPrice && <p className="text-sm text-[var(--warning)] mb-4" role="status">{t('addStock.needsPriceNote')}</p>}
              {result.confirm && <p className="text-sm text-[var(--text-secondary)] mb-4" role="status">{t('addStock.confirmNote')}</p>}
              {reviewProduct && result.needsPrice && <div className="grid grid-cols-2 gap-4 mb-5">{priceField}</div>}
              {!reviewProduct && (
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="col-span-2">
                    <label className="field-label" htmlFor="as-name">{t('addStock.name')}</label>
                    <input id="as-name" className="form-input" value={result.name} onChange={e => set({ name: e.target.value, placeholder: false })} />
                  </div>
                  {priceField}
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
              <div className="grid grid-cols-3 gap-3 mb-5">
                <PackField id="as-mfg" label={t('addStock.mfgDate')} source={result.fieldSources?.mfgDate} value={result.mfgText} placeholder="08/2026" onChange={(v) => set({ mfgText: v })} />
                <PackField id="as-exp" label={t('addStock.expiryDate')} source={result.fieldSources?.expiryDate} value={result.expiryText} placeholder="02/2027" onChange={(v) => set({ expiryText: v })} />
                <PackField id="as-batch" label={t('addStock.batch')} source={result.fieldSources?.batch} value={result.batch} onChange={(v) => set({ batch: v })} />
              </div>
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
                      {r.expiryDate && <span>· {t('addStock.expiryShort', { date: dateInputText(r.expiryDate) })}</span>}
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
