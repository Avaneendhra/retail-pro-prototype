import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

// --- Reusable Icons ---
const PhoneIcon = () => (
  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);
const EmailIcon = () => (
  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const HistoryIcon = () => (
  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const SendEmailIcon = () => (
  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const AvatarIcon = () => (
  <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-t-2xl">
    <svg className="w-20 h-20 text-gray-400 dark:text-gray-700" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  </div>
);
// --- End Icons ---

const CustomerCard = ({ customer, onSendEmail, onViewHistory, onDelete, canManage }) => {
  const { t } = useTranslation();
  const { id, name, email, mobile, totalPurchaseCount, lastPurchaseDate } = customer;

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="card relative flex flex-col group overflow-hidden"
    >
      {/* Image Placeholder */}
      <div className="aspect-w-1 aspect-h-1 w-full rounded-t-2xl overflow-hidden">
        <AvatarIcon />
      </div>

      {/* Details */}
      <div className="p-5 flex-grow flex flex-col">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate" title={name}>
          {/* MODIFIED */}
          {name || t('customerCard.unnamed')}
        </h3>

        {/* Contact Info */}
        <div className="mt-2 space-y-1.5">
          {mobile && (
            <div className="flex items-center gap-2">
              <PhoneIcon />
              <span className="text-sm text-gray-700 dark:text-gray-300">{mobile}</span>
            </div>
          )}
          {email && (
            <div className="flex items-center gap-2">
              <EmailIcon />
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={email}>{email}</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-end">
          <div className="text-left">
            {/* MODIFIED */}
            <p className="text-xs text-gray-500 font-medium">{t('customerCard.totalPurchases')}</p>
            <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400">
              {totalPurchaseCount || 0}
            </p>
          </div>
          <div className="text-right">
            {/* MODIFIED */}
            <p className="text-xs text-gray-500 font-medium">{t('customerCard.lastPurchase')}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatDate(lastPurchaseDate)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        {canManage && (
          <div className="mt-4 space-y-2">
            <button
              onClick={() => onSendEmail(customer)}
              className="button-primary w-full flex items-center justify-center"
            >
              <SendEmailIcon />
              {/* MODIFIED */}
              {t('customerCard.sendEmail')}
            </button>
            <button
              onClick={() => onViewHistory(customer)}
              className="button-secondary w-full flex items-center justify-center"
            >
              <HistoryIcon />
              {/* MODIFIED */}
              {t('customerCard.viewHistory')}
            </button>
            <button
              onClick={() => onDelete(customer)}
              className="w-full flex items-center justify-center px-4 py-2 rounded-lg font-medium
                         text-red-500 bg-gray-100 hover:bg-red-100 hover:text-red-600
                         dark:text-red-400 dark:bg-gray-800/50 dark:hover:bg-red-900/50 dark:hover:text-red-300
                         transition-all duration-300 disabled:opacity-50"
              // MODIFIED
              aria-label={t('customerCard.deleteAria', { name: name || t('customerCard.thisCustomer') })}
            >
              <DeleteIcon />
              {/* MODIFIED */}
              <span className="ml-1.5">{t('customerCard.delete')}</span>
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CustomerCard;