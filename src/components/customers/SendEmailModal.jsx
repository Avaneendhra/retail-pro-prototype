import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import { sendCustomEmail } from '../../services/customerService';
import { useTranslation } from 'react-i18next'; // <-- Import

// --- Reusable Icons ---
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30, bounce: 0.2 }
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: 0.2 }
  },
};

export default function SendEmailModal({ isOpen, onClose, selectedCustomers = [] }) {
  const { t } = useTranslation(); // <-- Get hook
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const getRecipientText = () => {
    if (selectedCustomers.length === 0) return t('emailModal.noRecipients');
    if (selectedCustomers.length === 1) {
      const c = selectedCustomers[0];
      return `${t('emailModal.to')} ${c.name || 'Unknown'} (${c.email || 'No email'})`;
    }
    return t('emailModal.toCount', { count: selectedCustomers.length });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedCustomers.length === 0) {
      const msg = t('emailModal.errorNoCustomers');
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!subject.trim() || !body.trim()) {
      const msg = t('emailModal.errorNoFields');
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setLoading(true);
    setError(null);

    const emailRequest = {
      customerIds: selectedCustomers.map(c => c.id),
      subject: subject.trim(),
      body: body.trim()
    };

    try {
      const response = await sendCustomEmail(emailRequest);
      showToast(response.message || `Email sending started!`, 'success');
      setSubject('');
      setBody('');
      onClose(true); // Close with success
    } catch (err) {
      const errMsg = err.error || err.message || "Failed to send emails.";
      setError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getSendButtonText = () => {
    if (loading) return t('emailModal.sending');
    if (selectedCustomers.length === 1) {
      return t('emailModal.send', { count: 1 });
    }
    return t('emailModal.sendPlural', { count: selectedCustomers.length });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4"
          onClick={() => !loading && onClose(false)}
        >
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="card max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* --- Modal Header --- */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-display">
                {t('emailModal.title')}
              </h2>
              <button
                onClick={() => onClose(false)}
                className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                disabled={loading}
                aria-label="Close modal"
              >
                <CloseIcon />
              </button>
            </div>

            {/* --- Modal Body --- */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar space-y-4">
              {error && (
                <div className="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded-lg" role="alert">
                  <span className="font-medium">Error:</span> {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  {t('emailModal.recipients')}
                </label>
                <div className="form-input bg-gray-100 dark:bg-gray-900/50 p-3 rounded-lg text-gray-700 dark:text-gray-300">
                  {getRecipientText()}
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  {t('emailModal.subject')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('emailModal.subjectPlaceholder')}
                  className="form-input-no-icon" // Use no-icon version
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="body" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  {t('emailModal.body')} <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="body"
                  rows="10"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('emailModal.bodyPlaceholder')}
                  className="form-input-no-icon resize-none" // Use no-icon version
                  required
                  disabled={loading}
                />
               <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                 {t('emailModal.personalizeHint')}
               </p>
              </div>
            </form>

            {/* --- Modal Footer --- */}
            <div className="flex justify-end items-center p-6 border-t border-gray-200 dark:border-gray-800 flex-shrink-0 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl space-x-3">
              <button
                type="button"
                onClick={() => onClose(false)}
                className="button-secondary"
                disabled={loading}
              >
                {t('emailModal.cancel')}
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                className="button-primary min-w-[180px]"
                disabled={loading || selectedCustomers.length === 0 || !subject.trim() || !body.trim()}
              >
                {getSendButtonText()}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}