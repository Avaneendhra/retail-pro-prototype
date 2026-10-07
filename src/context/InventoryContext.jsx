import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const InventoryContext = createContext();
export const useInventory = () => useContext(InventoryContext);

const STORAGE_KEY = 'sr_inventory';
const SALES_KEY = 'sr_sales';

// Seed data for demo
const SEED_PRODUCTS = [
  { id: 'P001', barcode: '8901030985551', name: 'Maggi 2-Minute Noodles', category: 'Grocery', price: 14, quantity: 120, reorderLevel: 20, addedAt: Date.now() },
  { id: 'P002', barcode: '8901262150821', name: 'Amul Butter 100g', category: 'Dairy', price: 58, quantity: 45, reorderLevel: 15, addedAt: Date.now() },
  { id: 'P003', barcode: '8901719280041', name: 'Parachute Coconut Oil 100ml', category: 'Personal Care', price: 40, quantity: 8, reorderLevel: 10, addedAt: Date.now() },
  { id: 'P004', barcode: '8901058850654', name: 'Coca Cola 1.25L', category: 'Beverages', price: 65, quantity: 60, reorderLevel: 25, addedAt: Date.now() },
  { id: 'P005', barcode: '8901314332306', name: 'Dairy Milk Silk', category: 'Snacks', price: 80, quantity: 5, reorderLevel: 10, addedAt: Date.now() },
  { id: 'P006', barcode: '8901491101219', name: 'Parle-G Biscuit 250g', category: 'Snacks', price: 25, quantity: 200, reorderLevel: 30, addedAt: Date.now() },
  { id: 'P007', barcode: '8901063267015', name: 'Surf Excel Matic 1kg', category: 'Household', price: 199, quantity: 3, reorderLevel: 8, addedAt: Date.now() },
  { id: 'P008', barcode: '8901396523116', name: 'Tata Salt 1kg', category: 'Grocery', price: 28, quantity: 90, reorderLevel: 20, addedAt: Date.now() },
];

const SEED_SALES = [
  { id: 'S001', productId: 'P001', productName: 'Maggi 2-Minute Noodles', qty: 5, price: 14, total: 70, date: Date.now() - 86400000 * 6 },
  { id: 'S002', productId: 'P004', productName: 'Coca Cola 1.25L', qty: 3, price: 65, total: 195, date: Date.now() - 86400000 * 5 },
  { id: 'S003', productId: 'P006', productName: 'Parle-G Biscuit 250g', qty: 10, price: 25, total: 250, date: Date.now() - 86400000 * 4 },
  { id: 'S004', productId: 'P005', productName: 'Dairy Milk Silk', qty: 4, price: 80, total: 320, date: Date.now() - 86400000 * 3 },
  { id: 'S005', productId: 'P002', productName: 'Amul Butter 100g', qty: 2, price: 58, total: 116, date: Date.now() - 86400000 * 2 },
  { id: 'S006', productId: 'P001', productName: 'Maggi 2-Minute Noodles', qty: 8, price: 14, total: 112, date: Date.now() - 86400000 * 1 },
  { id: 'S007', productId: 'P007', productName: 'Surf Excel Matic 1kg', qty: 2, price: 199, total: 398, date: Date.now() - 86400000 * 1 },
  { id: 'S008', productId: 'P003', productName: 'Parachute Coconut Oil 100ml', qty: 3, price: 40, total: 120, date: Date.now() },
];

export const InventoryProvider = ({ children }) => {
  const [products, setProducts] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : SEED_PRODUCTS;
    } catch { return SEED_PRODUCTS; }
  });

  const [sales, setSales] = useState(() => {
    try {
      const saved = localStorage.getItem(SALES_KEY);
      return saved ? JSON.parse(saved) : SEED_SALES;
    } catch { return SEED_SALES; }
  });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem(SALES_KEY, JSON.stringify(sales)); }, [sales]);

  const addProduct = useCallback((product) => {
    const existing = products.find(p => p.barcode === product.barcode);
    if (existing) {
      setProducts(prev => prev.map(p => p.barcode === product.barcode ? { ...p, quantity: p.quantity + (product.quantity || 1) } : p));
      return { action: 'updated', product: existing };
    }
    const newProduct = { ...product, id: 'P' + Date.now(), addedAt: Date.now() };
    setProducts(prev => [...prev, newProduct]);
    return { action: 'added', product: newProduct };
  }, [products]);

  const addBulkProducts = useCallback((productsList) => {
    const results = [];
    setProducts(prev => {
      let updated = [...prev];
      productsList.forEach(p => {
        const existingIdx = updated.findIndex(ex => ex.barcode === p.barcode || ex.name.toLowerCase() === p.name.toLowerCase());
        if (existingIdx >= 0) {
          updated[existingIdx] = { ...updated[existingIdx], quantity: updated[existingIdx].quantity + (p.quantity || 1) };
          results.push({ action: 'updated', name: updated[existingIdx].name });
        } else {
          const newP = { ...p, id: 'P' + Date.now() + Math.random().toString(36).substring(7), addedAt: Date.now() };
          updated.push(newP);
          results.push({ action: 'added', name: newP.name });
        }
      });
      return updated;
    });
    return results;
  }, []);

  const sellProduct = useCallback((barcode, qty) => {
    const product = products.find(p => p.barcode === barcode);
    if (!product) return { success: false, error: 'Product not found' };
    if (product.quantity < qty) return { success: false, error: `Only ${product.quantity} in stock` };

    setProducts(prev => prev.map(p => p.barcode === barcode ? { ...p, quantity: p.quantity - qty } : p));
    const sale = { id: 'S' + Date.now(), productId: product.id, productName: product.name, qty, price: product.price, total: product.price * qty, date: Date.now() };
    setSales(prev => [...prev, sale]);
    return { success: true, sale, product };
  }, [products]);

  const findByBarcode = useCallback((barcode) => products.find(p => p.barcode === barcode), [products]);

  const lowStockProducts = products.filter(p => p.quantity <= p.reorderLevel);

  const totalInventoryValue = products.reduce((sum, p) => sum + p.price * p.quantity, 0);
  const totalSalesValue = sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <InventoryContext.Provider value={{
      products, sales, addProduct, addBulkProducts, sellProduct, findByBarcode,
      lowStockProducts, totalInventoryValue, totalSalesValue, setProducts, setSales
    }}>
      {children}
    </InventoryContext.Provider>
  );
};
