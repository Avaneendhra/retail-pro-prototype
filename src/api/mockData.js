export const products = [
  { id: '1', productId: 'P001', code: 'ML', name: 'Milk (1L)', category: 'Dairy', price: 30, quantity: 23, barcode: '8901234567890', reorderLevel: 10 },
  { id: '2', productId: 'P002', code: 'BR', name: 'Bread (BR)', category: 'Bakery', price: 40, quantity: 14, barcode: '8901234567891', reorderLevel: 15 },
  { id: '3', productId: 'P003', code: 'PG', name: 'Parle-G Biscuit', category: 'Snacks', price: 10, quantity: 39, barcode: '8901234567892', reorderLevel: 20 },
  { id: '4', productId: 'P004', code: 'MG', name: 'Maggi Noodles', category: 'Snacks', price: 14, quantity: 45, barcode: '8901234567893', reorderLevel: 20 },
  { id: '5', productId: 'P005', code: 'SG', name: 'Sugar (1kg)', category: 'Grocery', price: 42, quantity: 18, barcode: '8901234567894', reorderLevel: 25 },
  { id: '6', productId: 'P006', code: 'OIL', name: 'Sunflower Oil (1L)', category: 'Grocery', price: 125, quantity: 8, barcode: '8901234567895', reorderLevel: 10 },
  { id: '7', productId: 'P007', code: 'DHS', name: 'Dettol Hand Sanitizer 50ml', category: 'Hygiene', price: 50, quantity: 50, barcode: '8901396381501', reorderLevel: 20 },
  { id: '8', productId: 'P008', code: 'PCM', name: 'Plum Coconut Milk Shampoo 250ml', category: 'Personal Care', price: 350, quantity: 20, barcode: '8904430200813', reorderLevel: 10 },
  { id: '9', productId: 'P009', code: 'KZM', name: 'Kz Plus Medicated Soap 50g', category: 'Personal Care', price: 125, quantity: 30, barcode: '8906058357559', reorderLevel: 15 },
];

export const aiAnalytics = {
  forecasting: [
    { day: 'Mon', actual: 4200, predicted: 4300 },
    { day: 'Tue', actual: 3800, predicted: 4000 },
    { day: 'Wed', actual: 4500, predicted: 4400 },
    { day: 'Thu', actual: 4100, predicted: 4200 },
    { day: 'Fri', actual: 5200, predicted: 5000 },
    { day: 'Sat', actual: null, predicted: 6200 },
    { day: 'Sun', actual: null, predicted: 5800 },
  ],
  smartReplenishment: [
    { name: 'Sunflower Oil (1L)', currentStock: 8, recommendedBuy: 30, reason: 'High velocity weekend item. Stock below reorder level.' },
    { name: 'Bread (BR)', currentStock: 14, recommendedBuy: 40, reason: 'Daily fast mover. Expected to run out in 2 days.' }
  ]
};

export const customers = [
  { id: 'c1', name: 'Alice Smith', email: 'alice@example.com', phone: '555-0101', loyaltyPoints: 120, totalPurchases: 1500 },
  { id: 'c2', name: 'Bob Johnson', email: 'bob@example.com', phone: '555-0102', loyaltyPoints: 340, totalPurchases: 4200 },
  { id: 'c3', name: 'Charlie Brown', email: 'charlie@example.com', phone: '555-0103', loyaltyPoints: 45, totalPurchases: 300 },
];

export const users = [
  { id: 'u1', name: 'Admin User', email: 'admin@smartretail.com', role: 'OWNER', status: 'ACTIVE' },
  { id: 'u2', name: 'Store Manager', email: 'manager@smartretail.com', role: 'MANAGER', status: 'ACTIVE' },
  { id: 'u3', name: 'Cashier 1', email: 'cashier@smartretail.com', role: 'CASHIER', status: 'ACTIVE' },
];

export const bills = [
  { id: 'b1', date: new Date().toISOString(), customerId: 'c1', totalAmount: 1249.98, paymentMethod: 'CARD', items: [{ productId: 'p2', quantity: 1, price: 999.99 }, { productId: 'p3', quantity: 1, price: 249.99 }] },
  { id: 'b2', date: new Date(Date.now() - 86400000).toISOString(), customerId: 'c2', totalAmount: 2499.99, paymentMethod: 'CASH', items: [{ productId: 'p1', quantity: 1, price: 2499.99 }] },
  { id: 'b3', date: new Date(Date.now() - 172800000).toISOString(), customerId: 'c3', totalAmount: 99.99, paymentMethod: 'CARD', items: [{ productId: 'p5', quantity: 1, price: 99.99 }] },
  { id: 'b4', date: new Date(Date.now() - 259200000).toISOString(), customerId: 'c1', totalAmount: 849.99, paymentMethod: 'UPI', items: [{ productId: 'p6', quantity: 1, price: 849.99 }] },
  { id: 'b5', date: new Date(Date.now() - 345600000).toISOString(), customerId: 'c2', totalAmount: 349.99, paymentMethod: 'CARD', items: [{ productId: 'p7', quantity: 1, price: 349.99 }] },
];

export const analytics = {
  daily: { revenue: 1249.98, orders: 1, itemsSold: 2 },
  monthly: { revenue: 5049.94, orders: 5, itemsSold: 6 },
  topProducts: [
    { name: 'Milk (1L)', category: 'Dairy', sold: 42, revenue: 1260 },
    { name: 'Bread (BR)', category: 'Bakery', sold: 35, revenue: 1400 },
    { name: 'Maggi Noodles', category: 'Snacks', sold: 89, revenue: 1246 },
    { name: 'Sugar (1kg)', category: 'Grocery', sold: 30, revenue: 1260 },
    { name: 'Sunflower Oil (1L)', category: 'Grocery', sold: 22, revenue: 2750 }
  ],
  revenueTrend: [
    { date: '2026-09-12', revenue: 1200 },
    { date: '2026-09-13', revenue: 2100 },
    { date: '2026-09-14', revenue: 1500 },
    { date: '2026-09-15', revenue: 3200 },
    { date: '2026-09-16', revenue: 2400 },
    { date: '2026-09-17', revenue: 2599.98 },
    { date: '2026-09-18', revenue: 1249.98 },
  ]
};

export const notifications = [
  { id: 'n1', message: 'Low stock alert for Logitech MX Master 3', date: new Date().toISOString(), read: false, type: 'WARNING' },
  { id: 'n2', message: 'Daily sales target reached!', date: new Date(Date.now() - 86400000).toISOString(), read: true, type: 'INFO' },
  { id: 'n3', message: 'New customer registered: Charlie Brown', date: new Date(Date.now() - 172800000).toISOString(), read: true, type: 'INFO' }
];
