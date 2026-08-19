import React, { useState } from 'react';
import { createCustomer } from '../../services/customerService';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function CustomerForm() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const nav = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await createCustomer({ name, email, mobile });
      nav('/customers');
    } catch (err) {
      alert("Failed to create customer: " + (err.response?.data?.message || err.message));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-md mx-auto p-6">
      <h2 className="card-title">{t('customerForm.title')}</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('customerForm.name')}</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('customerForm.name')}
            className="form-input-no-icon w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('customerForm.email')}</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t('customerForm.email')}
            type="email"
            className="form-input-no-icon w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('customerForm.mobile')}</label>
          <input
            value={mobile}
            onChange={e => setMobile(e.target.value)}
            placeholder={t('customerForm.mobile')}
            className="form-input-no-icon w-full"
            required
          />
        </div>
      </div>

      <button className="button-primary w-full mt-6">{t('customerForm.save')}</button>
    </form>
  );
}