import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { bulkUploadProducts } from '../../services/productService';
import { useTranslation } from 'react-i18next';

// --- Icons ---
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const UploadIcon = () => (
  <svg className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);
// --- End Icons ---

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

export default function BulkUploadModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setError(null);
  };

  // --- MODIFICATION: Removed productId from template ---
  const handleDownloadTemplate = () => {
    const headers = "name,category,price,quantity,minQuantity,reorderLevel,expiryDate(yyyy-MM-dd)";
    const example1 = "Milk,Dairy,50,100,10,20,2026-12-31";
    const example2 = "Cheese,Dairy,150,50,5,10,2026-10-20";
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + example1 + "\n" + example2;

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "product_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  // --- END MODIFICATION ---

  const handleSubmit = async () => {
    if (!file) {
      setError(t('products.bulkErrorFile'));
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await bulkUploadProducts(file);
      setResult(res);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || t('products.bulkErrorUpload'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setError(null);
    onClose(result); // Pass result back to refresh list if successful
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="card max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-display">
                {t('products.bulkTitle')}
              </h2>
              <button onClick={handleClose} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                <CloseIcon />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {error && (
                <div className="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded-lg mb-4">
                  {error}
                </div>
              )}

              {result ? (
                // --- Success/Result Screen ---
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{t('products.bulkSuccess')}</h3>
                  <div className="space-y-2">
                    <p className="text-green-600 dark:text-green-400">✅ {result.successful || 0} {t('products.bulkAdded')}</p>
                    <p className="text-yellow-600 dark:text-yellow-400">⚠️ {result.skipped || 0} {t('products.bulkSkipped')}</p>
                    <p className="text-red-600 dark:text-red-400">❌ {result.errors || 0} {t('products.bulkFailed')}</p>
                    {result.errorDetails?.length > 0 && (
                      <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-xs h-32 overflow-y-auto custom-scrollbar text-gray-700 dark:text-gray-300">
                        {result.errorDetails.join('\n')}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                // --- Upload Screen ---
                <div className="space-y-4">
                  <p className="text-gray-600 dark:text-gray-400">
                    {t('products.bulkStep1')}
                  </p>
                  <button onClick={handleDownloadTemplate} className="button-secondary w-full">
                    {t('products.bulkTemplate')}
                  </button>
                  <p className="text-gray-600 dark:text-gray-400">
                    {t('products.bulkStep2')}
                  </p>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 dark:border-gray-700 border-dashed rounded-lg cursor-pointer bg-gray-100/50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <UploadIcon />
                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                          <span className="font-semibold">{file ? file.name : t('products.bulkClick')}</span>
                        </p>
                        <p className="text-xs text-gray-500">{t('products.bulkFile')}</p>
                      </div>
                      <input type="file" className="hidden" accept=".csv" onChange={handleFileChange} />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end items-center p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
              <button onClick={handleClose} className="button-secondary mr-3">
                {result ? t('products.bulkClose') : t('products.bulkCancel')}
              </button>
              {!result && (
                <button
                  onClick={handleSubmit}
                  className="button-primary"
                  disabled={loading || !file}
                >
                  {loading ? t('products.bulkUploading') : t('products.bulkUploadProcess')}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}