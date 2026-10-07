import React, { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { createBill } from '../../services/billService';
import authService from '../../services/authService';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';
import api from '../../api/apiClient';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'framer-motion';

// --- Icons ---
const QuickAddIcon = () => (
  <svg className="w-5 h-5 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);
const RemoveIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);
const EmptyCartIcon = () => (
  <svg className="w-16 h-16 text-[var(--text-muted)] opacity-50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

export default function CheckoutPage() {
  const { cartItems, cartTotal, updateQuantity, removeFromCart, clearCart, addToCart } = useCart();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [customerInfo, setCustomerInfo] = useState({ name: '', email: '', mobile: '' });
  const [quickCode, setQuickCode] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // CASH or UPI
  const [upiStatus, setUpiStatus] = useState('PENDING'); // PENDING, SUCCESS
  const [loading, setLoading] = useState(false);
  
  const user = authService.getUserFromToken();
  const navigate = useNavigate();

  const handleCustomerChange = (e) => setCustomerInfo(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickCode.trim()) return;

    setQuickLoading(true);
    const parts = quickCode.trim().split(' ');
    const code = parts[0].toUpperCase();
    const qty = parts.length > 1 ? parseInt(parts[1], 10) : 1;

    try {
      const res = await api.get(`/api/products/code/${code}`);
      const product = res.data;
      if (product) {
        addToCart(product, isNaN(qty) ? 1 : qty);
        showToast(`Added ${qty}x ${product.name}`, 'success');
        setQuickCode('');
      }
    } catch (err) {
      showToast(`Product not found for code: ${code}`, 'error');
    } finally {
      setQuickLoading(false);
    }
  };

  const simulateUPIPayment = () => {
    setUpiStatus('SUCCESS');
    showToast('UPI Payment Received!', 'success');
  };

  const handleGenerateBill = async () => {
    if (!customerInfo.mobile) return showToast(t('checkout.errorMobile') || 'Mobile number is required', 'error');
    if (cartItems.length === 0) return showToast(t('checkout.errorEmptyCart') || 'Cart is empty', 'error');

    setLoading(true);
    const billRequest = {
      billId: `B${Date.now()}`,
      customer: { name: customerInfo.name || 'Customer', email: customerInfo.email, mobile: customerInfo.mobile },
      items: cartItems.map(item => ({ productId: item.productId, productName: item.name, qty: item.quantity, price: item.price })),
      paymentMethod,
      total: cartTotal,
      addedBy: user?.email || 'system',
    };

    try {
      const newBill = await createBill(billRequest);
      showToast(t('checkout.billSuccess', { billId: newBill.billId }) || `Bill generated successfully!`, 'success');
      clearCart();
      setCustomerInfo({ name: '', email: '', mobile: '' });
      setUpiStatus('PENDING');
      navigate('/bills');
    } catch (err) {
      showToast(t('checkout.billError', { error: err.response?.data?.error || err.message }), 'error');
    } finally {
      setLoading(false);
    }
  };

  const isCheckoutDisabled = loading || cartItems.length === 0 || !customerInfo.mobile || (paymentMethod === 'UPI' && upiStatus !== 'SUCCESS');

  return (
    <div className="animate-in max-w-6xl mx-auto">
      <div className="page-header">
        <h1 className="page-title">Point of Sale</h1>
        <p className="page-subtitle">Process orders and manage checkout</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Cart & Quick Add */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Quick Add Card */}
          <div className="card p-6 border-l-4 border-l-[var(--primary)] bg-[rgba(14,165,255,0.03)]">
            <div className="flex items-center gap-2 mb-4">
              <QuickAddIcon />
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Quick Add via Code</h3>
            </div>
            <form onSubmit={handleQuickAdd} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={quickCode}
                onChange={(e) => setQuickCode(e.target.value)}
                placeholder="Enter product code (e.g., 'ML 2')"
                className="form-input flex-grow text-lg py-3"
                autoFocus
              />
              <button type="submit" disabled={quickLoading || !quickCode.trim()} className="btn btn-primary py-3 px-8 text-lg shadow-glow">
                {quickLoading ? 'Adding...' : 'Add'}
              </button>
            </form>
            <p className="text-sm text-[var(--text-muted)] mt-3">Try default codes: ML (Milk), BR (Bread), PG (Parle-G)</p>
          </div>

          {/* Cart List Card */}
          <div className="card p-6 min-h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Current Order</h2>
              {cartItems.length > 0 && (
                <button onClick={clearCart} className="text-sm text-[var(--danger)] hover:underline font-semibold">
                  Clear All
                </button>
              )}
            </div>
            
            <div className="flex-grow">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <EmptyCartIcon />
                  <p className="text-lg font-medium text-[var(--text-secondary)]">Your cart is empty.</p>
                  <p className="text-[var(--text-muted)]">Scan a barcode or use Quick Add to begin.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {cartItems.map(item => (
                      <motion.div 
                        key={item.productId}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center gap-4 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl group hover:shadow-sm transition-all"
                      >
                        <div className="flex-grow min-w-0">
                          <p className="font-bold text-[var(--text-primary)] text-lg truncate">{item.name}</p>
                          <p className="text-sm text-[var(--text-muted)] font-medium">
                            ₹{item.price.toLocaleString('en-IN')} each
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-end mr-4">
                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Qty</p>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value))}
                              min="1"
                              className="form-input w-20 text-center font-bold !py-1"
                            />
                          </div>
                          <div className="flex flex-col items-end w-24">
                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Total</p>
                            <p className="text-lg font-extrabold text-[var(--text-primary)]">
                              ₹{(item.quantity * item.price).toLocaleString('en-IN')}
                            </p>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.productId)}
                            className="btn-icon text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white mt-4"
                            title="Remove"
                          >
                            <RemoveIcon />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Checkout Summary */}
        <div className="lg:col-span-4">
          <div className="card p-6 sticky top-6">
            <h3 className="card-title">Checkout</h3>
            
            {/* Customer Details */}
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Customer Name (Optional)</label>
                <input
                  type="text"
                  name="name"
                  value={customerInfo.name}
                  onChange={handleCustomerChange}
                  placeholder="E.g. John Doe"
                  className="form-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Mobile Number *</label>
                <input
                  type="tel"
                  name="mobile"
                  value={customerInfo.mobile}
                  onChange={handleCustomerChange}
                  placeholder="10-digit number"
                  className="form-input w-full font-bold"
                  required
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-8">
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Payment Method</label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPaymentMethod('CASH'); setUpiStatus('PENDING'); }}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all ${paymentMethod === 'CASH' ? 'bg-[var(--primary)] text-white shadow-glow' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  Cash
                </button>
                <button
                  onClick={() => setPaymentMethod('UPI')}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all ${paymentMethod === 'UPI' ? 'bg-[var(--primary)] text-white shadow-glow' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  UPI / QR
                </button>
              </div>
            </div>

            {/* UPI QR Display */}
            {paymentMethod === 'UPI' && cartTotal > 0 && (
              <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl border border-[var(--border)] text-center animate-in shadow-inner">
                <p className="text-sm text-[var(--text-secondary)] mb-4 font-medium">Scan to pay with any UPI App</p>
                <div className="flex justify-center mb-4">
                  <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <QRCode value={`upi://pay?pa=store@upi&pn=SmartRetail&am=${cartTotal}&cu=INR`} size={140} />
                  </div>
                </div>
                
                {upiStatus === 'PENDING' ? (
                  <button onClick={simulateUPIPayment} className="btn btn-secondary w-full text-sm">
                    (Mock) Simulate Payment
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-[var(--success)] font-bold bg-[rgba(16,185,129,0.1)] p-3 rounded-xl border border-[rgba(16,185,129,0.2)]">
                    <CheckIcon /> Payment Received
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            <div className="bg-[var(--surface)] rounded-xl p-4 mb-6 border border-[var(--border)]">
              <div className="flex justify-between text-[var(--text-secondary)] mb-2">
                <span>Subtotal</span>
                <span className="font-semibold text-[var(--text-primary)]">₹{cartTotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)] mb-4">
                <span>Tax (0%)</span>
                <span className="font-semibold text-[var(--text-primary)]">₹0</span>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-[var(--border)]">
                <span className="text-lg font-bold text-[var(--text-primary)]">Total</span>
                <span className="text-3xl font-extrabold text-[var(--primary)]">₹{cartTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleGenerateBill}
              disabled={isCheckoutDisabled}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex justify-center items-center gap-2 ${
                isCheckoutDisabled 
                  ? 'bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed' 
                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-glow hover:scale-[1.02]'
              }`}
            >
              {loading ? (
                'Processing...'
              ) : paymentMethod === 'UPI' && upiStatus !== 'SUCCESS' ? (
                'Waiting for Payment'
              ) : (
                'Generate Bill & Print'
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}