import React, { useState } from "react";
import { triggerReminders } from "../../services/customerService";
import { useTranslation } from 'react-i18next';

export default function ReminderTrigger() {
  const { t } = useTranslation();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleTrigger() {
    setLoading(true);
    setStatus("");
    try {
      const res = await triggerReminders();
      setStatus(res.message || t('reminder.success'));
    } catch (err) {
      setStatus(err.response?.data?.error || t('reminder.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card max-w-md mx-auto text-center p-6">
      <h2 className="card-title justify-center">📅 {t('reminder.title')}</h2>
      <button
        onClick={handleTrigger}
        disabled={loading}
        className="button-primary px-4 py-2"
      >
        {loading ? t('reminder.sending') : t('reminder.button')}
      </button>

      {status && (
        <p className="mt-3 text-sm font-medium text-blue-600 dark:text-blue-400">{status}</p>
      )}
    </div>
  );
}