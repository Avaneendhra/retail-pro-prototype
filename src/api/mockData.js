export const products = [
  { id: 'p1', name: 'MacBook Pro 16"', category: 'Laptops', barcode: '10001', price: 2499.99, costPrice: 2000, stockQuantity: 15, minStockLevel: 5 },
  { id: 'p2', name: 'iPhone 15 Pro', category: 'Smartphones', barcode: '10002', price: 999.99, costPrice: 800, stockQuantity: 42, minStockLevel: 10 },
  { id: 'p3', name: 'AirPods Pro 2', category: 'Accessories', barcode: '10003', price: 249.99, costPrice: 150, stockQuantity: 120, minStockLevel: 20 },
  { id: 'p4', name: 'iPad Air', category: 'Tablets', barcode: '10004', price: 599.99, costPrice: 450, stockQuantity: 30, minStockLevel: 8 },
  { id: 'p5', name: 'Logitech MX Master 3', category: 'Accessories', barcode: '10005', price: 99.99, costPrice: 60, stockQuantity: 4, minStockLevel: 10 },
];

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
];

export const analytics = {
  daily: { revenue: 1249.98, orders: 1, itemsSold: 2 },
  monthly: { revenue: 3849.96, orders: 3, itemsSold: 4 },
  topProducts: [
    { name: 'iPhone 15 Pro', sold: 42, revenue: 41999.58 },
    { name: 'MacBook Pro 16"', sold: 15, revenue: 37499.85 },
    { name: 'AirPods Pro 2', sold: 89, revenue: 22249.11 }
  ],
  revenueTrend: [
    { date: '2026-08-13', revenue: 1200 },
    { date: '2026-08-14', revenue: 2100 },
    { date: '2026-08-15', revenue: 1500 },
    { date: '2026-08-16', revenue: 3200 },
    { date: '2026-08-17', revenue: 2400 },
    { date: '2026-08-18', revenue: 2599.98 },
    { date: '2026-08-19', revenue: 1249.98 },
  ]
};

export const notifications = [
  { id: 'n1', message: 'Low stock alert for Logitech MX Master 3', date: new Date().toISOString(), read: false, type: 'WARNING' },
  { id: 'n2', message: 'Daily sales target reached!', date: new Date(Date.now() - 86400000).toISOString(), read: true, type: 'INFO' }
];
