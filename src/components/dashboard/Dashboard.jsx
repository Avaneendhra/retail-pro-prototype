import React, { useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#38BDF8', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export default function Dashboard() {
  const { products, sales, lowStockProducts, totalInventoryValue, totalSalesValue } = useInventory();

  // Sales by product (demand chart)
  const demandData = useMemo(() => {
    const map = {};
    sales.forEach(s => {
      map[s.productName] = (map[s.productName] || 0) + s.qty;
    });
    return Object.entries(map)
      .map(([name, qty]) => ({ name: name.length > 15 ? name.substring(0, 15) + '…' : name, qty, fullName: name }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
  }, [sales]);

  // Sales over time (last 7 days)
  const salesTrend = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      const dayStr = date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const dayTotal = sales.filter(s => s.date >= dayStart && s.date < dayEnd).reduce((sum, s) => sum + s.total, 0);
      days.push({ day: dayStr, revenue: dayTotal });
    }
    return days;
  }, [sales]);

  // Category distribution
  const categoryData = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const cat = p.category || 'Other';
      map[cat] = (map[cat] || 0) + p.quantity;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [products]);

  const todaySales = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    return sales.filter(s => s.date >= todayStart.getTime());
  }, [sales]);

  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Real-time inventory analytics & alerts</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="stat-icon blue"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg></span>
          </div>
          <div className="stat-value">{products.length}</div>
          <div className="stat-label">Total Products</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="stat-icon green"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></span>
          </div>
          <div className="stat-value">₹{totalInventoryValue.toLocaleString('en-IN')}</div>
          <div className="stat-label">Inventory Value</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="stat-icon amber"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg></span>
          </div>
          <div className="stat-value">₹{todayRevenue.toLocaleString('en-IN')}</div>
          <div className="stat-label">Today's Sales</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="stat-icon red"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></span>
          </div>
          <div className="stat-value text-[var(--danger)]">{lowStockProducts.length}</div>
          <div className="stat-label">Low Stock Alerts</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Demand Chart */}
        <div className="card p-5">
          <h3 className="card-title mb-4">📊 Product Demand (by units sold)</h3>
          {demandData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={demandData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '13px' }}
                  formatter={(value, name, props) => [`${value} units`, props.payload.fullName]} />
                <Bar dataKey="qty" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-[var(--text-muted)] py-12">No sales data yet</p>}
        </div>

        {/* Revenue Trend */}
        <div className="card p-5">
          <h3 className="card-title mb-4">📈 Revenue Trend (Last 7 Days)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={salesTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={v => `₹${v}`} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '13px' }}
                formatter={v => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke="var(--success)" strokeWidth={3} dot={{ fill: 'var(--success)', r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Category Distribution */}
        <div className="card p-5">
          <h3 className="card-title mb-4">📦 Inventory by Category</h3>
          {categoryData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '13px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {categoryData.map((cat, i) => (
                  <div key={cat.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-[var(--text-secondary)] flex-grow">{cat.name}</span>
                    <span className="font-bold text-[var(--text-primary)]">{cat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-center text-[var(--text-muted)] py-12">No products</p>}
        </div>

        {/* Low Stock Alerts */}
        <div className="card p-5">
          <h3 className="card-title mb-4 flex items-center gap-2">
            <span className="text-[var(--danger)]">⚠️</span> Low Stock Alerts
          </h3>
          {lowStockProducts.length > 0 ? (
            <div className="space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar">
              {lowStockProducts.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)] text-sm">{p.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{p.category}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-lg ${p.quantity <= 5 ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>{p.quantity}</p>
                    <p className="text-xs text-[var(--text-muted)]">Min: {p.reorderLevel}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <span className="text-4xl mb-2 block">✅</span>
              <p className="font-medium text-[var(--success)]">All products are well-stocked!</p>
            </div>
          )}
        </div>
      </div>

      {/* Full Inventory Table */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-[var(--border)]">
          <h3 className="card-title">📋 Full Inventory</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Barcode</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td className="font-semibold">{p.name}</td>
                  <td className="font-mono text-xs text-[var(--text-muted)]">{p.barcode}</td>
                  <td><span className="badge badge-info">{p.category}</span></td>
                  <td className="font-bold">₹{p.price}</td>
                  <td className="font-bold">{p.quantity}</td>
                  <td>
                    {p.quantity <= p.reorderLevel ? (
                      p.quantity <= 5 ? <span className="badge badge-danger">Critical</span> : <span className="badge badge-warning">Low</span>
                    ) : <span className="badge badge-success">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
