import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCustomer, updateCustomer } from '../../services/customerService';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';

export default function CustomerEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [customer, setCustomer] = useState({
    name: '',
    email: '',
    mobile: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getCustomer(id);
        setCustomer(data);
      } catch (err) {
        const msg = err.response?.data?.message || err.message;
        showToast(`${t('customerEdit.errorLoad')} ${msg}`, 'error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, showToast, t]);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await updateCustomer(id, customer);
      showToast(t('customerEdit.success'), 'success');
      nav('/customers');
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error('Update failed:', err.response?.data || err);
      showToast(`${t('customerEdit.errorUpdate')} ${msg}`, 'error');
    }
  }

  if (loading) return <div className="card p-6 text-center text-gray-500 dark:text-gray-400">{t('customerEdit.loading')}</div>;

  return (
    <div className="card max-w-lg mx-auto p-6">
      <h2 className="card-title">{t('customerEdit.title')}</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('customerForm.name')}</label>
          <input
            type="text"
            value={customer.name}
            onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
            className="form-input-no-icon w-full"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('customerForm.email')}</label>
          <input
            type="email"
            value={customer.email}
            onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
            className="form-input-no-icon w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('customerForm.mobile')}</label>
          <input
            type="text"
            value={customer.mobile}
            onChange={(e) => setCustomer({ ...customer, mobile: e.target.value })}
            className="form-input-no-icon w-full"
          />
        </div>

        <button type="submit" className="button-primary w-full mt-3">
          {t('customerForm.save')}
        </button>
      </form>
    </div>
  );
}