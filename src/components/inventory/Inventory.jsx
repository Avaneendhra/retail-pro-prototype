import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';

export default function Inventory() {
  const { products, totalInventoryValue } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.barcode.includes(searchTerm);
    const matchesCategory = categoryFilter ? p.category === categoryFilter : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-3">
            <span className="stat-icon blue"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></span>
            Inventory Management
          </h1>
          <p className="page-subtitle">View and manage your entire stock catalog</p>
        </div>
        <div className="bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)] shadow-sm flex items-center gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase">Total Products</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">{products.length}</p>
          </div>
          <div className="w-px h-8 bg-[var(--border)]" />
          <div>
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase">Stock Value</p>
            <p className="text-xl font-bold text-[var(--success)]">₹{totalInventoryValue.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {/* Search & Filters */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)] flex flex-col sm:flex-row gap-4">
          <div className="relative flex-grow">
            <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input 
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by product name or barcode..." 
              className="form-input"
            />
          </div>
          <select 
            value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            className="form-input-no-icon sm:w-48 bg-[var(--bg)] cursor-pointer"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Product Table */}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Product Details</th>
                <th>Category</th>
                <th>Selling Price</th>
                <th>Current Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length > 0 ? (
                filteredProducts.map(p => (
                  <tr key={p.id} className="group">
                    <td>
                      <p className="font-bold text-[var(--text-primary)]">{p.name}</p>
                      <p className="text-xs font-mono text-[var(--text-muted)] mt-1">{p.barcode}</p>
                    </td>
                    <td><span className="badge badge-info">{p.category || 'N/A'}</span></td>
                    <td><span className="font-bold text-[var(--primary)] text-lg">₹{p.price}</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-xl ${p.quantity <= p.reorderLevel ? (p.quantity <= 5 ? 'text-[var(--danger)]' : 'text-[var(--warning)]') : 'text-[var(--success)]'}`}>
                          {p.quantity}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">units</span>
                      </div>
                      <div className="progress-bar-container mt-1 max-w-[100px]">
                        <div className="progress-bar" style={{ width: `${Math.min(100, (p.quantity / (p.reorderLevel * 3)) * 100)}%`, background: p.quantity <= p.reorderLevel ? (p.quantity <= 5 ? 'var(--danger)' : 'var(--warning)') : 'var(--success)' }} />
                      </div>
                    </td>
                    <td>
                      {p.quantity <= p.reorderLevel ? (
                        p.quantity <= 5 ? <span className="badge badge-danger">Critical Stock</span> : <span className="badge badge-warning">Low Stock</span>
                      ) : <span className="badge badge-success">In Stock</span>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-12">
                    <div className="text-5xl mb-3">🔍</div>
                    <p className="text-[var(--text-primary)] font-bold text-lg mb-1">No products found</p>
                    <p className="text-[var(--text-muted)]">Try adjusting your search or filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
