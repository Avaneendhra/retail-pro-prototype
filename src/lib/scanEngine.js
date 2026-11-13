// Scanning engine: camera control, barcode detection and label OCR.
//
// Barcodes: the browser's native BarcodeDetector when available (Android Chrome),
// otherwise ZXing C++ compiled to WebAssembly (zxing-wasm) with "try harder"
// enabled. Both are far more robust on real camera frames than the old
// JavaScript ZXing port.
// The WASM file is bundled with the app (no CDN), so scanning also works offline.

import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { isPlausibleBarcode } from './productLookup';

prepareZXingModule({
  overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
});

const ZX_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'QRCode', 'DataMatrix'];
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix'];

let nativeDetector; // undefined = not checked yet, null = unavailable
async function getNativeDetector() {
  if (nativeDetector !== undefined) return nativeDetector;
  nativeDetector = null;
  try {
    if ('BarcodeDetector' in window) {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter(f => supported.includes(f));
      if (formats.includes('ean_13')) nativeDetector = new window.BarcodeDetector({ formats });
    }
  } catch { nativeDetector = null; }
  return nativeDetector;
}

/** Load the WASM engine early so the first scan is fast. */
export function warmUpBarcodeEngine() {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  readBarcodes(c.getContext('2d').getImageData(0, 0, 8, 8), { formats: ['EAN13'] }).catch(() => {});
  getNativeDetector();
}

/**
 * Find a retail barcode in a canvas. Returns { text, format } or null.
 * `hard` enables ZXing's slower, more thorough search (used for still photos).
 */
export async function detectBarcode(canvas, { hard = false } = {}) {
  const native = await getNativeDetector();
  if (native) {
    try {
      const found = await native.detect(canvas);
      for (const b of found) if (isPlausibleBarcode(b.rawValue, b.format)) return { text: b.rawValue, format: b.format };
    } catch { /* fall through to ZXing */ }
  }
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const results = await readBarcodes(data, {
      formats: ZX_FORMATS, tryHarder: true, tryRotate: true, tryInvert: hard, tryDownscale: true, maxNumberOfSymbols: 1,
    });
    for (const r of results) if (r.isValid && isPlausibleBarcode(r.text, r.format)) return { text: r.text, format: r.format };
  } catch { /* nothing found */ }
  return null;
}

/** Draw (part of) a video/image into a canvas, scaled so its width is at most `maxW`. */
export function drawRegion(source, { x = 0, y = 0, w, h, maxW = 1280, zoom = 1 } = {}) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  const rw = w ?? sw, rh = h ?? sh;
  const scale = Math.min(zoom, maxW / rw);
  const c = document.createElement('canvas');
  c.width = Math.round(rw * scale);
  c.height = Math.round(rh * scale);
  c.getContext('2d', { willReadFrequently: true }).drawImage(source, x, y, rw, rh, 0, 0, c.width, c.height);
  return c;
}

/** Unsharp mask + contrast stretch: recovers slightly blurred / far-away barcodes. */
export function sharpen(canvas, amount = 1.5) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  const d = ctx.getImageData(0, 0, W, H);
  const p = d.data;
  const g = new Float32Array(W * H);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) g[j] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
  // horizontal running box blur (bars are vertical, so blur across them)
  const b = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let sum = 0;
    for (let x = -2; x <= 2; x++) sum += g[row + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      b[row + x] = sum / 5;
      sum += g[row + Math.min(W - 1, x + 3)] - g[row + Math.max(0, x - 2)];
    }
  }
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < g.length; j++) {
    const v = g[j] + amount * (g[j] - b[j]);
    b[j] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const r = Math.max(1, max - min);
  for (let j = 0; j < g.length; j++) {
    const v = ((b[j] - min) / r) * 255;
    p[j * 4] = p[j * 4 + 1] = p[j * 4 + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

/**
 * Barcode search over a live frame. Each call tries one region/processing
 * combination, cycling through them so every frame stays cheap.
 */
export async function scanVideoFrame(video, attempt = 0) {
  const W = video?.videoWidth, H = video?.videoHeight;
  if (!W || !H) return null;
  const band = { x: W * 0.1, y: H * 0.25, w: W * 0.8, h: H * 0.5 };
  const tight = { x: W * 0.2, y: H * 0.3, w: W * 0.6, h: H * 0.4 };
  const zoom = { x: W * 0.28, y: H * 0.34, w: W * 0.44, h: H * 0.32, zoom: 2.2, maxW: 1400 };
  const full = { x: 0, y: 0, w: W, h: H };
  const plan = [
    [band, 0], [band, 1.5], [tight, 0], [zoom, 0],
    [band, 3], [zoom, 2], [full, 0], [tight, 2],
  ];
  const [region, amount] = plan[attempt % plan.length];
  const canvas = drawRegion(video, { maxW: 1280, ...region });
  if (amount) sharpen(canvas, amount);
  return detectBarcode(canvas);
}

/** Barcode search over a still image (upload or captured frame): try several crops. */
export async function scanImage(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const regions = [
    { x: 0, y: 0, w: W, h: H },
    { x: W * 0.15, y: H * 0.15, w: W * 0.7, h: H * 0.7 },
    { x: W * 0.25, y: H * 0.25, w: W * 0.5, h: H * 0.5, zoom: 2 },
  ];
  for (const amount of [0, 1.5, 3]) {
    for (const r of regions) {
      const c = drawRegion(img, { maxW: 1600, ...r });
      if (amount) sharpen(c, amount);
      const hit = await detectBarcode(c, { hard: true });
      if (hit) return hit;
    }
  }
  return null;
}

export const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

/* ── Camera ─────────────────────────────────────────────────── */

/** Open the back camera at high resolution with continuous autofocus. */
export async function openCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  try {
    const advanced = [];
    if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
    if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
    if (advanced.length) await track.applyConstraints({ advanced });
  } catch { /* not supported on this device */ }
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  return { stream, track, hasTorch: !!caps.torch };
}

export async function setTorch(track, on) {
  try { await track.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; }
}

export function closeCamera(stream) {
  stream?.getTracks().forEach(t => t.stop());
}

/* ── Label OCR ──────────────────────────────────────────────── */

/** Grayscale + contrast stretch, scaled to ~1400-2000 px wide: noticeably better OCR on packaging. */
export function prepareForOcr(source) {
  const sw = source.naturalWidth || source.videoWidth || source.width;
  const sh = source.naturalHeight || source.videoHeight || source.height;
  const scale = sw < 1400 ? 1400 / sw : Math.min(1, 2000 / sw);
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(source, 0, 0, c.width, c.height);
  return stretch(c);
}

function stretch(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = d.data;
  let min = 255, max = 0;
  const g = new Uint8ClampedArray(p.length / 4);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    g[j] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    if (g[j] < min) min = g[j];
    if (g[j] > max) max = g[j];
  }
  const range = Math.max(1, max - min);
  for (let j = 0; j < g.length; j++) {
    const v = ((g[j] - min) / range) * 255;
    p[j * 4] = p[j * 4 + 1] = p[j * 4 + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

/**
 * OCR a label and return { text, lines: [{ text, height, conf }] }.
 * Line heights let us pick the product name: it is usually the biggest text on the pack.
 */
export async function ocrLabel(worker, source) {
  const canvas = prepareForOcr(source);
  await worker.setParameters({ tessedit_pageseg_mode: '11' }); // sparse text: suits packaging
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  const lines = [];
  for (const b of data.blocks || []) for (const para of b.paragraphs || []) for (const ln of para.lines || []) {
    const words = (ln.words || []).filter(w => w.confidence >= 55 && /\p{L}{2,}/u.test(w.text));
    if (!words.length) continue;
    const height = words.reduce((s, w) => s + (w.bbox.y1 - w.bbox.y0), 0) / words.length;
    lines.push({ text: words.map(w => w.text).join(' '), height, conf: ln.confidence, y: ln.bbox.y0, x: ln.bbox.x0 });
  }
  return { text: data.text || '', lines: mergeRows(lines) };
}

/** Sparse OCR can split one printed line into pieces ("Cashew Co" + "okies"); join pieces on the same row. */
function mergeRows(lines) {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const l of sorted) {
    const row = rows.find(r => Math.abs(r.y - l.y) < Math.max(r.height, l.height) * 0.5 && Math.abs(r.height - l.height) < Math.max(r.height, l.height) * 0.35);
    if (row) row.parts.push(l);
    else rows.push({ y: l.y, height: l.height, parts: [l] });
  }
  return rows.map(r => {
    const parts = r.parts.sort((a, b) => a.x - b.x);
    let text = parts[0].text;
    for (const p of parts.slice(1)) text += /^[a-z]/.test(p.text) && /[A-Za-z]$/.test(text) ? p.text : ` ${p.text}`;
    return {
      text, y: r.y, x: parts[0].x,
      height: parts.reduce((s, p) => s + p.height, 0) / parts.length,
      conf: parts.reduce((s, p) => s + p.conf, 0) / parts.length,
    };
  });
}
