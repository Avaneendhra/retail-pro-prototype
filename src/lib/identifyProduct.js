// Works out which product is in front of the camera, barcode first.
//
//   1. The barcode: from the live camera, or decoded from the photo.
//      GS1 codes also give batch, dates and sometimes price, and those win.
//   2. Your own products, by barcode.
//   3. Free product databases, by barcode: name, brand, category, picture.
//   4. The label, only for what is still missing (MRP, dates, batch, or the
//      name when no database knows the barcode).
import { parseBarcode } from './barcodeData.js';

const DETAIL_FIELDS = ['price', 'mfgDate', 'expiryDate', 'batch'];

/** Does label text alone look like a real product, not a wall or a hand? */
export function looksLikeProduct(label) {
  if (!label?.name) return false;
  const words = label.name.split(/\s+/).filter((w) => /\p{L}{3,}/u.test(w));
  return words.length >= 2 && (label.mrp > 0 || !!label.size || !!label.brand || !!label.barcode);
}

/**
 * input: { barcode?, format?, dataUrl?, quiet? }
 * deps:  { decodeImage(dataUrl), lookup(code), readLabel(dataUrl, { quiet }), findByBarcode(code), byId(id), matchByName(name, size) }
 * Returns null, or a draft: { productId?, barcode, name, category, price, batch, mfgDate, expiryDate,
 *   image, placeholder, sources, fieldSources }. fieldSources says where each value came from.
 */
export async function identifyProduct({ barcode = '', format = '', dataUrl = null, quiet = false }, deps) {
  const fieldSources = {};
  const draft = { barcode: '', name: '', category: '', price: 0, batch: '', mfgDate: '', expiryDate: '', image: dataUrl };
  const take = (field, value, source) => {
    if (value === undefined || value === null || value === '' || value === 0) return;
    if (fieldSources[field]) return; // the first, more reliable source keeps it
    draft[field] = value;
    fieldSources[field] = source;
  };

  // 1. Barcode first.
  let scanned = barcode ? { text: barcode, format } : null;
  if (!scanned && dataUrl) scanned = await deps.decodeImage(dataUrl);
  let code = scanned ? parseBarcode(scanned.text, scanned.format) : null;
  // A square code that is not GS1 (a UPI payment QR, a web link) is not a product number.
  if (code && code.kind === 'other' && (/QR|Aztec|PDF417|DataMatrix|MaxiCode/i.test(scanned.format || '') || /^[a-z][\w+.-]*:/i.test(code.code))) code = null;
  if (code) {
    take('barcode', code.code, 'barcode');
    for (const field of DETAIL_FIELDS) take(field, code[field], 'barcode');
  }

  // 2. One of your products?
  let known = code ? deps.findByBarcode(code.code) : null;

  // 3 and 4. Databases and the label, the label only when something is still missing.
  const missing = () => !draft.price || !draft.mfgDate || !draft.expiryDate;
  const readLabel = () => (dataUrl ? deps.readLabel(dataUrl, { quiet }) : Promise.resolve(null));
  let [db, label] = await Promise.all([
    code && !known ? deps.lookup(code.code) : null,
    !code || missing() ? readLabel() : null,
  ]);
  if (!known && !db?.name && !label && dataUrl) label = await readLabel();

  if (!code && label?.barcode) {
    const fromLabel = parseBarcode(label.barcode);
    take('barcode', fromLabel.code, 'label');
    known = deps.findByBarcode(fromLabel.code);
    if (!known && !db) db = await deps.lookup(fromLabel.code);
  }
  if (!known && !draft.barcode && label?.matchedId) known = deps.byId(label.matchedId);
  if (!known && !draft.barcode && !db && label?.name) known = deps.matchByName(label.name, label.size);

  const labelSource = label?.engine === 'claude' ? 'claude' : 'label';
  for (const field of ['mfgDate', 'expiryDate', 'batch']) take(field, label?.[field], labelSource);
  take('price', label?.mrp, labelSource);

  const sources = [];
  if (fieldSources.barcode === 'barcode') sources.push('barcode');

  if (known) {
    if (!fieldSources.barcode) take('barcode', known.barcode, 'catalog');
    return { ...draft, productId: known.id, name: known.name, sources: [...sources, 'catalog'], fieldSources: { ...fieldSources, name: 'catalog' } };
  }

  // In the automatic loop a frame without a barcode must clearly show a product.
  if (!draft.barcode && !db && (label?.engine === 'claude' ? !label?.name : !looksLikeProduct(label))) return null;

  take('name', db?.name, 'database');
  take('name', label?.name, labelSource);
  take('category', db?.category && db.category !== 'other' ? db.category : '', 'database');
  take('category', label?.category && label.category !== 'other' ? label.category : '', labelSource);
  if (db?.image) draft.image = db.image;

  if (db) sources.push('database');
  if (Object.values(fieldSources).includes(labelSource)) sources.push(labelSource);
  return { ...draft, placeholder: !draft.name, mrpFromLabel: fieldSources.price === labelSource, sources, fieldSources };
}
