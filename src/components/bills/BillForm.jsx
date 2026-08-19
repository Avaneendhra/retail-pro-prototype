import React, { useEffect, useState } from 'react';
import { createBill } from '../../services/billService';
import { listCustomers } from '../../services/customerService';
import { listProducts } from '../../services/productService';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../context/ToastContext';

export default function BillForm() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [items, setItems] = useState([{ productId: '', quantity: 1 }]);
  const [total, setTotal] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [custs, prods] = await Promise.all([listCustomers(), listProducts()]);
        setCustomers(custs);
        setProducts(prods);
      } catch (err) {
        showToast("Failed to load customers or products", 'error');
      }
    })();
  }, [showToast]);

  useEffect(() => {
    let t = 0;
    for (const item of items) {
      const prod = products.find(p => p.productId === item.productId);
      if (prod) t += prod.price * item.quantity;
    }
    setTotal(t);
  }, [items, products]);

  function addItem() {
    setItems([...items, { productId: '', quantity: 1 }]);
  }

  function updateItem(index, field, value) {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  }

  function removeItem(index) {
    const updated = [...items];
    updated.splice(index, 1);
    setItems(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const selected = customers.find(
      c => c.customerId === selectedCustomer || c.id === selectedCustomer || c._id === selectedCustomer
    );

    if (!selected) {
      showToast(t('billForm.errorCustomer'), 'error');
      return;
    }

    try {
      const billRequest = {
        billId: 'B' + Date.now(),
        customer: {
          name: selected.name,
          email: selected.email,
          mobile: selected.mobile || selected.phone || selected.contactNumber,
        },
        items: items.map(it => ({
          productId: it.productId,
          qty: parseInt(it.quantity, 10),
        })),
        addedBy: 'system',
      };

      await createBill(billRequest);
      showToast(t('billForm.success'), 'success');
      nav('/bills');
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || t('billForm.errorCreate');
      showToast(msg, 'error');
    }
  }

  return (
    <div className="card max-w-3xl mx-auto p-6">
      <h2 className="card-title">{t('billForm.title')}</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1.5 font-medium text-gray-600 dark:text-gray-400">{t('billForm.customer')}</label>
          <select
            value={selectedCustomer}
            onChange={e => setSelectedCustomer(e.target.value)}
            className="form-input-no-icon w-full"
            required
          >
            <option value="">{t('billForm.selectCustomer')}</option>
            {customers.map((c, index) => (
              <option
                key={c.customerId || c.id || c._id || index}
                value={c.customerId || c.id || c._id}
              >
                {c.name} ({c.email || c.mobile})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-2 font-medium text-gray-600 dark:text-gray-400">{t('billForm.items')}</label>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex gap-2 items-center">
                <select
                  value={item.productId}
                  onChange={e => updateItem(index, 'productId', e.target.value)}
                  className="form-input-no-icon flex-1"
                  required
                >
                  <option value="">{t('billForm.selectProduct')}</option>
                  {products.map((p, i) => (
                    <option
                      key={p.productId || p.id || i}
                      value={p.productId || p.id}
                    >
                      {p.name} (₹{p.price})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={e => updateItem(index, 'quantity', e.target.value)}
                  className="form-input-no-icon w-24"
                  required
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addItem}
              className="button-secondary !bg-green-600 !text-white hover:!bg-green-700"
            >
              {t('billForm.addItem')}
            </button>
          </div>
        </div>

        <div className="text-right text-xl font-bold text-gray-900 dark:text-white">
          {t('billForm.total')} ₹{total.toFixed(2)}
        </div>

        <div className="text-center pt-4">
          <button type="submit" className="button-primary w-1/2">
            {t('billForm.createBill')}
          </button>
        </div>
      </form>
    </div>
  );
}