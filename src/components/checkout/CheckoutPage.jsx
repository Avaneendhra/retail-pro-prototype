import React, { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { createBill } from '../../services/billService';
import authService from '../../services/authService';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next'; // <-- Import

export default function CheckoutPage() {
  const { cartItems, cartTotal, updateQuantity, removeFromCart, clearCart } = useCart();
  const { showToast } = useToast();
  const { t } = useTranslation(); // <-- Get hook

  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    email: '',
    mobile: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const user = authService.getUserFromToken();
  const navigate = useNavigate();

  const handleCustomerChange = (e) => {
    const { name, value } = e.target;
    setCustomerInfo(prev => ({ ...prev, [name]: value }));
  };

  const handleGenerateBill = async () => {
    if (!customerInfo.mobile) {
      const msg = t('checkout.errorMobile');
      setError(msg);
      showToast(msg, 'error');
      return;
    }
    if (cartItems.length === 0) {
      const msg = t('checkout.errorEmptyCart');
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setLoading(true);
    setError(null);

    const billRequest = {
      billId: `B${Date.now()}`,
      customer: {
        name: customerInfo.name || 'Customer',
        email: customerInfo.email,
        mobile: customerInfo.mobile,
      },
      items: cartItems.map(item => ({
        productId: item.productId,
        productName: item.name,
        qty: item.quantity,
        price: item.price,
      })),
      addedBy: user?.email || 'system',
    };

    try {
      const newBill = await createBill(billRequest);
      showToast(t('checkout.billSuccess', { billId: newBill.billId }), 'success');
      clearCart();
      setCustomerInfo({ name: '', email: '', mobile: '' });
      navigate('/bills');
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setError(t('checkout.billError', { error: errMsg }));
      showToast(t('checkout.billError', { error: errMsg }), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Cart Items */}
      <div className="lg:col-span-2 card p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{t('checkout.title')}</h2>
        {error && (
          <div className="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        <div className="space-y-4">
          {cartItems.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">{t('checkout.empty')}</p>
          ) : (
            cartItems.map(item => (
              <div key={item.productId} className="flex items-center gap-4 p-3 bg-gray-100 dark:bg-gray-800/50 rounded-lg">
                <div className="flex-grow">
                  <p className="font-semibold text-gray-900 dark:text-white">{item.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {item.quantity} x {item.price.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                  </p>
                </div>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value))}
                  min="1"
                  className="form-input w-20 text-center !pl-2"
                />
                <p className="text-lg font-semibold text-gray-900 dark:text-white w-24 text-right">
                  {(item.quantity * item.price).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                </p>
                <button
                  onClick={() => removeFromCart(item.productId)}
                  className="text-red-500 hover:text-red-400"
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Summary & Checkout */}
      <div className="lg:col-span-1 card p-6 h-fit">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('checkout.summary')}</h3>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-gray-700 dark:text-gray-300">
            <span>{t('checkout.subtotal')}</span>
            <span className="font-medium">{cartTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
          </div>
          <div className="flex justify-between text-gray-700 dark:text-gray-300">
            <span>{t('checkout.taxes')}</span>
            <span className="font-medium">{t('checkout.taxesValue')}</span>
          </div>
          <div className="flex justify-between text-gray-900 dark:text-white text-lg font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
            <span>{t('checkout.total')}</span>
            <span>{cartTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">
            {t('checkout.customerDetails')}
          </label>
          <input
            type="text"
            name="name"
            value={customerInfo.name}
            onChange={handleCustomerChange}
            placeholder={t('checkout.customerName')}
            className="form-input-no-icon w-full"
          />
          <input
            type="text"
            name="mobile"
            value={customerInfo.mobile}
            onChange={handleCustomerChange}
            placeholder={t('checkout.customerMobile')}
            className="form-input-no-icon w-full"
            required
          />
          <input
            type="email"
            name="email"
            value={customerInfo.email}
            onChange={handleCustomerChange}
            placeholder={t('checkout.customerEmail')}
            className="form-input-no-icon w-full"
          />
        </div>

        <button
          onClick={handleGenerateBill}
          disabled={loading || cartItems.length === 0 || !customerInfo.mobile}
          className="button-primary w-full mt-6"
        >
          {loading ? t('checkout.generatingBill') : t('checkout.generateBill')}
        </button>
      </div>
    </div>
  );
}