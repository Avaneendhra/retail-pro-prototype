export const products = [
  { id: 'p1', productId: 'p1', name: 'MacBook Pro 16"', category: 'Laptops', barcode: '8901234567890', price: 2499.99, costPrice: 2000, stockQuantity: 15, quantity: 15, reorderLevel: 5, minStockLevel: 5 },
  { id: 'p2', productId: 'p2', name: 'iPhone 15 Pro', category: 'Smartphones', barcode: '8901234567891', price: 999.99, costPrice: 800, stockQuantity: 42, quantity: 42, reorderLevel: 10, minStockLevel: 10 },
  { id: 'p3', productId: 'p3', name: 'AirPods Pro 2', category: 'Accessories', barcode: '8901234567892', price: 249.99, costPrice: 150, stockQuantity: 120, quantity: 120, reorderLevel: 20, minStockLevel: 20 },
  { id: 'p4', productId: 'p4', name: 'iPad Air', category: 'Tablets', barcode: '8901234567893', price: 599.99, costPrice: 450, stockQuantity: 30, quantity: 30, reorderLevel: 8, minStockLevel: 8 },
  { id: 'p5', productId: 'p5', name: 'Logitech MX Master 3', category: 'Accessories', barcode: '8901234567894', price: 99.99, costPrice: 60, stockQuantity: 4, quantity: 4, reorderLevel: 10, minStockLevel: 10 },
  { id: 'p6', productId: 'p6', name: 'Samsung Galaxy S24', category: 'Smartphones', barcode: '8901234567895', price: 849.99, costPrice: 650, stockQuantity: 25, quantity: 25, reorderLevel: 8, minStockLevel: 8 },
  { id: 'p7', productId: 'p7', name: 'Sony WH-1000XM5', category: 'Accessories', barcode: '8901234567896', price: 349.99, costPrice: 250, stockQuantity: 18, quantity: 18, reorderLevel: 5, minStockLevel: 5 },
  { id: 'p8', productId: 'p8', name: 'Dell XPS 15', category: 'Laptops', barcode: '8901234567897', price: 1899.99, costPrice: 1500, stockQuantity: 10, quantity: 10, reorderLevel: 3, minStockLevel: 3 },
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
  { id: 'b4', date: new Date(Date.now() - 259200000).toISOString(), customerId: 'c1', totalAmount: 849.99, paymentMethod: 'UPI', items: [{ productId: 'p6', quantity: 1, price: 849.99 }] },
  { id: 'b5', date: new Date(Date.now() - 345600000).toISOString(), customerId: 'c2', totalAmount: 349.99, paymentMethod: 'CARD', items: [{ productId: 'p7', quantity: 1, price: 349.99 }] },
];

export const analytics = {
  daily: { revenue: 1249.98, orders: 1, itemsSold: 2 },
  monthly: { revenue: 5049.94, orders: 5, itemsSold: 6 },
  topProducts: [
    { name: 'iPhone 15 Pro', sold: 42, revenue: 41999.58 },
    { name: 'MacBook Pro 16"', sold: 15, revenue: 37499.85 },
    { name: 'AirPods Pro 2', sold: 89, revenue: 22249.11 },
    { name: 'Samsung Galaxy S24', sold: 30, revenue: 25499.70 },
    { name: 'Sony WH-1000XM5', sold: 22, revenue: 7699.78 }
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
