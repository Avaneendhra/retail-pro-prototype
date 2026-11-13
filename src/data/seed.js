// Demo catalogue + generated sales history for the prototype.
// Every product has a short code (fast billing), a product ID, and names
// in English, Telugu, Hindi and Marathi.

const DAY = 86400000;

// rate  = base units sold per day (used only to generate history)
// trend = growth over the 4-week history (+0.6 = demand rising 60%)
// coverDays = how many days of stock to reorder for (perishables are short)
export const SEED_PRODUCTS = [
  { id: 'P1001', code: 'ML',  barcode: '8901262010017', category: 'dairy',     price: 30,  quantity: 40, min: 20, coverDays: 2, rate: 22,  trend: 0.1,
    name: 'Milk 500ml', names: { te: 'పాలు 500ml', hi: 'दूध 500ml', mr: 'दूध 500ml' }, aliases: ['milk', 'doodh', 'paalu'] },
  { id: 'P1002', code: 'BR',  barcode: '8901725121228', category: 'bakery',    price: 40,  quantity: 8,  min: 10, coverDays: 3, rate: 12,  trend: 1.1,
    name: 'Bread', names: { te: 'బ్రెడ్', hi: 'ब्रेड', mr: 'ब्रेड' }, aliases: ['bread', 'pav'] },
  { id: 'P1003', code: 'BS',  barcode: '8901719110016', category: 'snacks',    price: 10,  quantity: 60, min: 30, coverDays: 7, rate: 12,  trend: 0.05,
    name: 'Parle-G Biscuits', names: { te: 'పార్లే-జి బిస్కెట్లు', hi: 'पारले-जी बिस्किट', mr: 'पारले-जी बिस्किटे' }, aliases: ['biscuit', 'biscuits', 'parle'] },
  { id: 'P1004', code: 'MG',  barcode: '8901058851298', category: 'snacks',    price: 14,  quantity: 85, min: 25, coverDays: 7, rate: 9,   trend: 0.2,
    name: 'Maggi Noodles', names: { te: 'మ్యాగీ నూడుల్స్', hi: 'मैगी नूडल्स', mr: 'मॅगी नूडल्स' }, aliases: ['maggi', 'noodles'] },
  { id: 'P1005', code: 'RC',  barcode: '8906001200019', category: 'grocery',   price: 60,  quantity: 34, min: 15, coverDays: 7, rate: 5,   trend: 0,
    name: 'Rice 1kg', names: { te: 'బియ్యం 1kg', hi: 'चावल 1kg', mr: 'तांदूळ 1kg' }, aliases: ['rice', 'chawal', 'biyyam'] },
  { id: 'P1006', code: 'SG',  barcode: '8906001200026', category: 'grocery',   price: 45,  quantity: 18, min: 15, coverDays: 7, rate: 4,   trend: 0.15,
    name: 'Sugar 1kg', names: { te: 'చక్కెర 1kg', hi: 'चीनी 1kg', mr: 'साखर 1kg' }, aliases: ['sugar', 'cheeni', 'shakkar'] },
  { id: 'P1007', code: 'OIL', barcode: '8901088100014', category: 'grocery',   price: 150, quantity: 12, min: 10, coverDays: 7, rate: 3,   trend: 0.1,
    name: 'Sunflower Oil 1L', names: { te: 'సన్‌ఫ్లవర్ నూనె 1L', hi: 'सूरजमुखी तेल 1L', mr: 'सूर्यफूल तेल 1L' }, aliases: ['oil', 'cooking oil', 'sunflower', 'tel'] },
  { id: 'P1008', code: 'SP',  barcode: '8901030703222', category: 'personal',  price: 35,  quantity: 46, min: 15, coverDays: 7, rate: 3,   trend: 0,
    name: 'Lux Soap', names: { te: 'లక్స్ సబ్బు', hi: 'लक्स साबुन', mr: 'लक्स साबण' }, aliases: ['soap', 'lux', 'sabun'] },
  { id: 'P1009', code: 'TS',  barcode: '8904043901015', category: 'grocery',   price: 28,  quantity: 52, min: 15, coverDays: 7, rate: 3,   trend: 0,
    name: 'Tata Salt 1kg', names: { te: 'టాటా ఉప్పు 1kg', hi: 'टाटा नमक 1kg', mr: 'टाटा मीठ 1kg' }, aliases: ['salt', 'namak', 'uppu'] },
  { id: 'P1010', code: 'TEA', barcode: '8901052002016', category: 'beverages', price: 120, quantity: 21, min: 8,  coverDays: 7, rate: 2,   trend: 0.05,
    name: 'Tata Tea 250g', names: { te: 'టాటా టీ పొడి 250g', hi: 'टाटा चाय 250g', mr: 'टाटा चहा 250g' }, aliases: ['tea', 'chai', 'chaha'] },
  { id: 'P1011', code: 'EG',  barcode: '8906010400011', category: 'dairy',     price: 42,  quantity: 30, min: 24, coverDays: 3, rate: 10,  trend: 0.5,
    name: 'Eggs (6)', names: { te: 'గుడ్లు (6)', hi: 'अंडे (6)', mr: 'अंडी (6)' }, aliases: ['egg', 'eggs', 'anda'] },
  { id: 'P1012', code: 'CK',  barcode: '8901764012716', category: 'beverages', price: 40,  quantity: 40, min: 12, coverDays: 7, rate: 4,   trend: -0.55,
    name: 'Coca-Cola 750ml', names: { te: 'కోకా-కోలా 750ml', hi: 'कोका-कोला 750ml', mr: 'कोका-कोला 750ml' }, aliases: ['coke', 'cola', 'coca cola', 'cold drink'] },
  { id: 'P1013', code: 'TP',  barcode: '8901314010315', category: 'personal',  price: 55,  quantity: 25, min: 8,  coverDays: 7, rate: 1.5, trend: 0,
    name: 'Colgate Toothpaste 100g', names: { te: 'కోల్గేట్ టూత్‌పేస్ట్ 100g', hi: 'कोलगेट टूथपेस्ट 100g', mr: 'कोलगेट टूथपेस्ट 100g' }, aliases: ['toothpaste', 'colgate', 'paste'] },
  { id: 'P1014', code: 'DT',  barcode: '8901030865234', category: 'household', price: 199, quantity: 6,  min: 5,  coverDays: 7, rate: 0.5, trend: -0.2,
    name: 'Surf Excel 1kg', names: { te: 'సర్ఫ్ ఎక్సెల్ 1kg', hi: 'सर्फ एक्सेल 1kg', mr: 'सर्फ एक्सेल 1kg' }, aliases: ['detergent', 'surf', 'washing powder'] },
  { id: 'P1015', code: 'BT',  barcode: '8901262150821', category: 'dairy',     price: 58,  quantity: 14, min: 8,  coverDays: 3, rate: 2,   trend: 0.1,
    name: 'Amul Butter 100g', names: { te: 'అమూల్ వెన్న 100g', hi: 'अमूल मक्खन 100g', mr: 'अमूल लोणी 100g' }, aliases: ['butter', 'makhan', 'amul'] },
  { id: 'P1016', code: 'DAL', barcode: '8906001200057', category: 'grocery',   price: 160, quantity: 22, min: 6,  coverDays: 7, rate: 0.4, trend: -0.1,
    name: 'Toor Dal 1kg', names: { te: 'కందిపప్పు 1kg', hi: 'अरहर दाल 1kg', mr: 'तूर डाळ 1kg' }, aliases: ['dal', 'toor', 'pappu', 'arhar'] },
];

export const CATEGORIES = ['dairy', 'bakery', 'snacks', 'grocery', 'beverages', 'personal', 'household', 'other'];

// Small deterministic PRNG so the demo history is the same on every device.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEKDAY_FACTOR = [1.25, 0.9, 0.9, 0.95, 1.0, 1.1, 1.3]; // Sun..Sat

/** 28 days of sales history, one line per product per day. */
export function generateSalesHistory(products, now = Date.now()) {
  const rand = mulberry32(20261113);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const startToday = today.getTime();
  const hourFraction = Math.min(1, Math.max(0.25, (now - startToday) / DAY));
  const sales = [];
  for (let daysAgo = 27; daysAgo >= 0; daysAgo--) {
    const dayStart = startToday - daysAgo * DAY;
    const wd = WEEKDAY_FACTOR[new Date(dayStart).getDay()];
    for (const p of products) {
      const growth = 1 + p.trend * ((27 - daysAgo) / 27);
      const noise = 0.75 + rand() * 0.5;
      let qty = p.rate * growth * wd * noise;
      if (daysAgo === 0) qty *= hourFraction;
      // slow movers: sell on some days only
      qty = qty < 1 ? (rand() < qty ? 1 : 0) : Math.round(qty);
      if (qty <= 0) continue;
      sales.push({
        id: `H${daysAgo}-${p.id}`,
        billId: null,
        productId: p.id,
        productName: p.name,
        qty,
        price: p.price,
        total: qty * p.price,
        date: dayStart + 9 * 3600000 + Math.floor(rand() * 11 * 3600000),
      });
    }
  }
  return sales.filter(s => s.date <= now);
}

export function seedProducts() {
  // strip generator-only fields
  return SEED_PRODUCTS.map(({ rate, trend, ...p }) => ({ ...p, addedAt: Date.now() }));
}
