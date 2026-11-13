import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../lib/settings';
import { pname, fmtDate } from '../../lib/format';
import Modal from '../common/Modal';

export default function PurchaseOrders() {
  const { t } = useTranslation();
  const { products, stats, purchaseOrders, createPO, updatePO, deletePO, receivePO, byId } = useInventory();
  const { showToast } = useToast();
  const [settings] = useSettings();
  const [params] = useSearchParams();
  const [receiving, setReceiving] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [adding, setAdding] = useState({});
  const highlight = params.get('open');

  useEffect(() => {
    if (highlight) setTimeout(() => document.getElementById(`po-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
  }, [highlight]);

  useEffect(() => {
    if (!printing) return;
    const id = setTimeout(() => { window.print(); setPrinting(null); }, 50);
    return () => clearTimeout(id);
  }, [printing]);

  const recommended = products.filter(p => stats[p.id]?.needsReorder);

  const orderAll = () => {
    const po = createPO({ items: recommended.map(p => ({ productId: p.id, qty: stats[p.id].recommendedQty })) });
    showToast(t('inventory.poCreated', { no: po.id }), 'success');
  };

  const shareText = (po) => {
    const lines = po.items.map(i => `• ${byId(i.productId)?.name || i.productId} — ${i.qty}`).join('\n');
    return `${t('orders.shareText', { no: po.id, shop: settings.shopName })}${po.supplier ? ` (${po.supplier})` : ''}\n\n${lines}`;
  };

  const setItemQty = (po, productId, qty) => updatePO(po.id, { items: po.items.map(i => i.productId === productId ? { ...i, qty: Math.max(1, qty || 1) } : i) });
  const removeItem = (po, productId) => updatePO(po.id, { items: po.items.filter(i => i.productId !== productId) });
  const addItem = (po) => {
    const pid = adding[po.id];
    if (!pid || po.items.some(i => i.productId === pid)) return;
    updatePO(po.id, { items: [...po.items, { productId: pid, qty: stats[pid]?.recommendedQty || 10 }] });
    setAdding(a => ({ ...a, [po.id]: '' }));
  };

  const statusBadge = (s) => <span className={`badge ${s === 'received' ? 'badge-success' : s === 'sent' ? 'badge-warning' : 'badge-info'}`}>{t(`orders.${s}`)}</span>;
  const recvPO = purchaseOrders.find(p => p.id === receiving);
  const printPO = purchaseOrders.find(p => p.id === printing);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="page-header flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="page-title">{t('orders.title')}</h1>
          <p className="page-subtitle">{t('orders.subtitle')}</p>
        </div>
        {recommended.length > 0 && <button className="btn btn-cta shrink-0" onClick={orderAll}>{t('orders.createFromRec', { count: recommended.length })}</button>}
      </div>

      {purchaseOrders.length === 0 && (
        <div className="card p-10 text-center">
          <p className="font-medium text-lg">{t('orders.empty')}</p>
          <p className="text-[var(--text-secondary)] mt-2">{t('orders.emptyHint')}</p>
        </div>
      )}

      <div className="space-y-5">
        {purchaseOrders.map(po => {
          const editable = po.status !== 'received';
          return (
            <section key={po.id} id={`po-${po.id}`} className={`card p-6 ${highlight === po.id ? '!border-[var(--accent-blue)]' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-display text-[22px] font-bold tracking-tight font-mono">{po.id}</h2>
                    {statusBadge(po.status)}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    {t('orders.created', { date: fmtDate(po.createdAt) })} · {t('orders.items', { count: po.items.length })}
                    {po.receivedAt && ` · ${t('orders.receivedOn', { date: fmtDate(po.receivedAt) })}`}
                  </p>
                </div>
                <input className="form-input md:w-64" placeholder={t('orders.supplierPlaceholder')} aria-label={t('orders.supplier')}
                  value={po.supplier} disabled={!editable} onChange={e => updatePO(po.id, { supplier: e.target.value })} />
              </div>

              <div className="card-inset divide-y divide-[var(--border)]">
                {po.items.map(it => {
                  const p = byId(it.productId);
                  const ch = po.changes?.find(c => c.productId === it.productId);
                  return (
                    <div key={it.productId} className="flex items-center gap-4 px-4 py-3">
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">{p ? pname(p) : it.productId}</span>
                        <span className="block text-xs text-[var(--text-muted)] font-mono">
                          {ch ? `${ch.before} → ${ch.after}` : p ? `${t('common.stock')}: ${p.quantity} · ${t('common.min')} ${p.min}` : ''}
                        </span>
                      </span>
                      {editable ? (
                        <>
                          <input className="form-input !w-24 !py-2 text-center font-mono" inputMode="numeric" value={it.qty} aria-label={t('common.qty')}
                            onChange={e => setItemQty(po, it.productId, parseInt(e.target.value.replace(/\D/g, ''), 10))} />
                          <button className="btn-icon" onClick={() => removeItem(po, it.productId)} aria-label={t('common.remove')}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" /></svg>
                          </button>
                        </>
                      ) : <span className="font-mono font-semibold text-[var(--success)]">+{it.qty}</span>}
                    </div>
                  );
                })}
                {editable && (
                  <div className="flex gap-2 px-4 py-3">
                    <select className="form-input !py-2 flex-1" value={adding[po.id] || ''} onChange={e => setAdding(a => ({ ...a, [po.id]: e.target.value }))} aria-label={t('orders.addItem')}>
                      <option value="">{t('orders.addItem')}…</option>
                      {products.filter(p => !po.items.some(i => i.productId === p.id)).map(p => <option key={p.id} value={p.id}>{pname(p)} · {p.code}</option>)}
                    </select>
                    <button className="btn btn-secondary btn-sm" onClick={() => addItem(po)} disabled={!adding[po.id]}>{t('common.add')}</button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-5">
                <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(shareText(po))}`} target="_blank" rel="noopener noreferrer">{t('orders.whatsapp')}</a>
                <button className="btn btn-ghost btn-sm" onClick={() => setPrinting(po.id)}>{t('common.print')}</button>
                {po.status === 'draft' && <button className="btn btn-secondary btn-sm" onClick={() => updatePO(po.id, { status: 'sent' })}>{t('orders.markSent')}</button>}
                {editable && <button className="btn btn-primary btn-sm" disabled={!po.items.length} onClick={() => setReceiving(po.id)}>{t('orders.markReceived')}</button>}
                {po.status === 'draft' && (
                  <button className="btn btn-sm text-[var(--danger)] ml-auto" onClick={() => { if (window.confirm(t('orders.deleteConfirm'))) deletePO(po.id); }}>{t('common.delete')}</button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {recvPO && (
        <Modal open onClose={() => setReceiving(null)} title={t('orders.receiveTitle', { no: recvPO.id })}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setReceiving(null)}>{t('common.cancel')}</button>
            <button className="btn btn-cta" onClick={() => { receivePO(recvPO.id); showToast(t('orders.receivedToast', { no: recvPO.id }), 'success'); setReceiving(null); }}>{t('orders.receiveConfirm')}</button>
          </>}>
          <p className="text-[var(--text-secondary)] -mt-2 mb-4">{t('orders.receiveBody')}</p>
          <div className="card-inset p-4 divide-y divide-[var(--border)]">
            {recvPO.items.map(it => {
              const p = byId(it.productId);
              return (
                <div key={it.productId} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex-1 truncate font-medium">{p ? pname(p) : it.productId}</span>
                  <span className="font-mono text-[var(--text-muted)]">{p?.quantity}</span>
                  <span className="text-[var(--text-muted)]">→</span>
                  <span className="font-mono font-semibold w-12">{(p?.quantity || 0) + it.qty}</span>
                  <span className="font-mono text-xs text-[var(--success)] w-12 text-right">+{it.qty}</span>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {printPO && (
        <div className="print-area" aria-hidden="true">
          <h2>{settings.shopName}</h2>
          <p>{printPO.id} · {fmtDate(printPO.createdAt)}</p>
          {printPO.supplier && <p>{t('orders.supplier')}: {printPO.supplier}</p>}
          <table><tbody>
            {printPO.items.map(i => <tr key={i.productId}><td>{byId(i.productId)?.name}</td><td style={{ textAlign: 'right' }}>{i.qty}</td></tr>)}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
