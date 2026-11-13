import React, { useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';

// Simulated OCR: parse text from a fake "invoice" for demo purposes
// In production this would use Tesseract.js or a Cloud Vision API
function parseInvoiceText(text) {
  // This is a simulation — in a real app, OCR extracts the text first
  return [];
}

// Demo invoice items (simulates what OCR would extract)
const DEMO_INVOICE_ITEMS = [
  { name: 'Maggi 2-Minute Noodles', barcode: '8901030985551', category: 'Grocery', price: 14, quantity: 24 },
  { name: 'Amul Butter 100g', barcode: '8901262150821', category: 'Dairy', price: 58, quantity: 12 },
  { name: 'Parle-G Biscuit 250g', barcode: '8901491101219', category: 'Snacks', price: 25, quantity: 48 },
  { name: 'Tata Salt 1kg', barcode: '8901396523116', category: 'Grocery', price: 28, quantity: 20 },
  { name: 'Coca Cola 1.25L', barcode: '8901058850654', category: 'Beverages', price: 65, quantity: 10 },
];

export default function InvoiceScanner() {
  const { addBulkProducts } = useInventory();
  const { showToast } = useToast();

  const [parsedItems, setParsedItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imported, setImported] = useState(false);
  const [results, setResults] = useState([]);
  const fileInputRef = useRef(null);

  const handleInvoiceUpload = async (e) => {
    if (!e.target.files?.length) return;
    setIsProcessing(true);
    setImported(false);
    setResults([]);

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // In a real app, we'd use Tesseract.js OCR here:
    // const worker = await createWorker('eng');
    // const { data: { text } } = await worker.recognize(file);
    // const items = parseInvoiceText(text);

    // For the prototype, we use demo data to show the flow
    setParsedItems(DEMO_INVOICE_ITEMS.map(item => ({ ...item, selected: true })));
    setIsProcessing(false);
    showToast(`Extracted ${DEMO_INVOICE_ITEMS.length} items from invoice`, 'success');

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleItem = (index) => {
    setParsedItems(prev => prev.map((item, i) => i === index ? { ...item, selected: !item.selected } : item));
  };

  const updateItemQty = (index, qty) => {
    setParsedItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(1, qty) } : item));
  };

  const handleImport = () => {
    const selectedItems = parsedItems.filter(item => item.selected);
    if (selectedItems.length === 0) {
      showToast('No items selected', 'error');
      return;
    }
    const importResults = addBulkProducts(selectedItems);
    setResults(importResults);
    setImported(true);
    showToast(`Successfully imported ${importResults.length} items to inventory!`, 'success');
  };

  const handleReset = () => {
    setParsedItems([]);
    setImported(false);
    setResults([]);
  };

  const selectedCount = parsedItems.filter(i => i.selected).length;
  const totalValue = parsedItems.filter(i => i.selected).reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-3">
          <span className="stat-icon amber"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></span>
          Invoice Scanner
        </h1>
        <p className="page-subtitle">Upload a wholesaler invoice/bill to bulk-add products to inventory</p>
      </div>

      {parsedItems.length === 0 && !isProcessing && (
        <div className="card p-8">
          <div className="text-center max-w-md mx-auto">
            <div className="stat-icon amber mx-auto mb-4" style={{ width: '72px', height: '72px', borderRadius: '20px' }}>
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Upload Wholesaler Invoice</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Take a photo or upload an image of your wholesaler's bill/invoice. The system will extract product names, quantities, and prices, then add them to your inventory.
            </p>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleInvoiceUpload} className="hidden" id="invoice-upload" />
            <label htmlFor="invoice-upload" className="btn btn-primary px-8 py-4 text-lg shadow-glow cursor-pointer inline-flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Upload Invoice Image
            </label>
            <p className="text-xs text-[var(--text-muted)] mt-4">Supports JPG, PNG, PDF images • Max 10MB</p>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 border-4 border-t-[var(--primary)] border-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Processing Invoice...</h3>
          <p className="text-sm text-[var(--text-muted)]">Extracting product information using OCR</p>
        </div>
      )}

      {parsedItems.length > 0 && !imported && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-bold text-[var(--text-primary)]">Extracted Items ({parsedItems.length})</h2>
              <p className="text-sm text-[var(--text-muted)]">Review and adjust quantities before importing</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge badge-info">{selectedCount} selected</span>
              <span className="font-bold text-[var(--primary)]">₹{totalValue.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price (₹)</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {parsedItems.map((item, i) => (
                  <tr key={i} className={!item.selected ? 'opacity-40' : ''}>
                    <td>
                      <input type="checkbox" checked={item.selected} onChange={() => toggleItem(i)} className="w-4 h-4 accent-[var(--primary)]" />
                    </td>
                    <td>
                      <div className="font-semibold text-[var(--text-primary)]">{item.name}</div>
                      <div className="text-xs text-[var(--text-muted)] font-mono">{item.barcode}</div>
                    </td>
                    <td><span className="badge badge-info">{item.category}</span></td>
                    <td className="font-bold">₹{item.price}</td>
                    <td>
                      <input type="number" min="1" value={item.quantity} onChange={e => updateItemQty(i, parseInt(e.target.value) || 1)}
                        className="form-input-no-icon w-20 text-center font-bold py-1 px-2" />
                    </td>
                    <td className="font-bold text-[var(--primary)]">₹{(item.price * item.quantity).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-5 border-t border-[var(--border)] bg-[var(--bg)] flex justify-between items-center flex-wrap gap-3">
            <button onClick={handleReset} className="btn btn-secondary">Cancel</button>
            <button onClick={handleImport} className="btn btn-primary px-8 py-3 shadow-glow text-lg">
              ✅ Import {selectedCount} Items to Inventory
            </button>
          </div>
        </div>
      )}

      {imported && (
        <div className="card overflow-hidden animate-in">
          <div className="bg-[var(--success)] p-5 text-white text-center">
            <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <h2 className="text-xl font-bold">Invoice Imported Successfully!</h2>
            <p className="text-green-100">{results.length} products have been added to your inventory</p>
          </div>
          <div className="p-5">
            <div className="space-y-2 mb-5">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                  <span className={`badge ${r.action === 'added' ? 'badge-success' : 'badge-info'}`}>{r.action === 'added' ? 'New' : 'Updated'}</span>
                  <span className="font-medium text-[var(--text-primary)]">{r.name}</span>
                </div>
              ))}
            </div>
            <button onClick={handleReset} className="btn btn-primary w-full py-3">Upload Another Invoice</button>
          </div>
        </div>
      )}
    </div>
  );
}
