import Fuse from 'fuse.js';

const SUPPLIER_HINT = /(distribut|traders?|agenc|enterprise|supplier|wholesale|stores|mart|ltd|pvt|company|\bco\.)/i;
const SKIP_LINE = /(total|subtotal|sub-total|gst|cgst|sgst|igst|tax|amount|invoice|bill\s*no|date|phone|ph\.|mobile|gstin|address|thank|^qty|^rate|description|particulars|^item|^s\.?\s?no|^sl|signature|balance|discount|round)/i;

/** Pull supplier, invoice number, date and item lines out of raw OCR text. */
export function parseInvoiceText(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 1);

  let supplier = '';
  const labelled = text.match(/(?:supplier|from|sold by|vendor)\s*[:\-]\s*([^\n]+)/i);
  if (labelled) supplier = labelled[1].trim();
  if (!supplier) supplier = lines.find(l => SUPPLIER_HINT.test(l) && !/invoice/i.test(l)) || '';
  if (!supplier) supplier = lines.find(l => /[A-Za-z]{3,}/.test(l) && !SKIP_LINE.test(l)) || '';
  supplier = supplier.replace(/[|_]+/g, '').trim();

  const inv = text.match(/(?:invoice|inv|bill)\s*(?:no\.?|number|num|#)?\s*[:#.\-]?\s*([A-Z]{0,4}[-/]?\d[\w\-/]*)/i)
    || text.match(/\b(INV[-\s]?\d{2,})\b/i);
  const invoiceNo = inv ? inv[1].replace(/\s/g, '').toUpperCase() : '';

  const dateMatch = text.match(/\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/);
  const date = dateMatch ? dateMatch[1] : '';

  const items = [];
  // "Milk 500ml 50 26 1300", "2. Bread — 40", "Parle-G Biscuits x 100"
  const ITEM = /^(?:\d{1,2}[.)]\s*)?([A-Za-z][A-Za-z0-9 .&'()/+-]*?[A-Za-z)])\s*[—–:\-x×|*]*\s*(\d+(?:\.\d+)?)\b(.*)$/;
  for (const line of lines) {
    if (SKIP_LINE.test(line) || line === supplier) continue;
    const m = line.match(ITEM);
    if (!m) continue;
    const qty = Math.round(parseFloat(m[2]));
    if (!qty || qty > 5000) continue;
    const rest = (m[3].match(/\d+(?:\.\d+)?/g) || []).map(Number);
    items.push({ raw: line, name: m[1].trim(), qty, unitPrice: rest[0] || 0 });
  }
  return { supplier, invoiceNo, date, items };
}

/** Find the best catalogue product for an invoice line name. */
export function makeMatcher(products) {
  const fuse = new Fuse(products, {
    keys: [{ name: 'name', weight: 2 }, 'names.te', 'names.hi', 'names.mr', { name: 'aliases', weight: 1.5 }, 'code'],
    threshold: 0.42, includeScore: true, ignoreLocation: true,
  });
  return (name) => {
    const lower = ` ${name.toLowerCase()} `;
    // 1. alias / code as a whole word ("Parle-G Biscuits 100g" -> biscuits)
    for (const p of products) {
      const words = [...(p.aliases || []), p.name.toLowerCase()];
      if (words.some(w => w && new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?[^a-z]`, 'i').test(lower))) {
        return { product: p, confident: true };
      }
    }
    // 2. fuzzy
    const [hit] = fuse.search(name, { limit: 1 });
    if (hit) return { product: hit.item, confident: hit.score < 0.25 };
    return { product: null, confident: false };
  };
}

/** Downscale an image (data URL) so OCR and upload stay fast. */
export function downscale(dataUrl, max = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Draws a realistic sample supplier invoice for demos. */
export function sampleInvoiceImage() {
  const c = document.createElement('canvas');
  c.width = 1000; c.height = 1180;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#111111';
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  g.font = 'bold 46px Arial'; g.fillText('ABC Distributors', 60, 100);
  g.font = '26px Arial';
  g.fillText('12 Market Road, Hyderabad', 60, 145);
  g.fillText('GSTIN 36ABCDE1234F1Z5', 60, 182);
  g.font = 'bold 30px Arial';
  g.fillText('Invoice No: INV-1025', 60, 260);
  g.fillText(`Date: ${date}`, 620, 260);
  g.fillRect(60, 300, 880, 3);
  g.font = 'bold 28px "Courier New", monospace';
  g.fillText('Item                Qty   Rate   Amount', 60, 350);
  g.fillRect(60, 372, 880, 2);
  g.font = '30px "Courier New", monospace';
  const rows = [['Milk 500ml', 50, 26], ['Bread', 40, 34], ['Parle-G Biscuits', 100, 8], ['Sunflower Oil 1L', 12, 132]];
  rows.forEach(([n, q, r], i) => {
    const y = 425 + i * 60;
    g.fillText(n.padEnd(19, ' ') + String(q).padStart(4, ' ') + String(r).padStart(7, ' ') + String(q * r).padStart(9, ' '), 60, y);
  });
  const total = rows.reduce((s, [, q, r]) => s + q * r, 0);
  g.fillRect(60, 690, 880, 2);
  g.font = 'bold 30px "Courier New", monospace';
  g.fillText('Total'.padEnd(39, ' ') + String(total).padStart(0, ' '), 60, 740);
  g.font = '24px Arial'; g.fillText('Thank you for your business', 60, 1100);
  return c.toDataURL('image/png');
}
