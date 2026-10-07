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
const CameraIcon = () => (
  <svg className="w-12 h-12 text-blue-400 dark:text-blue-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
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
  const [activeTab, setActiveTab] = useState('OCR'); // 'CSV' or 'OCR'
  
  // CSV State
  const [file, setFile] = useState(null);
  
  // OCR State
  const [imageFile, setImageFile] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setError(null);
  };

  const handleImageChange = (e) => {
    setImageFile(e.target.files[0]);
    setOcrResult(null);
    setError(null);
  };

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

  const handleCSVSubmit = async () => {
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

  const handleScanInvoice = () => {
    if (!imageFile) {
      setError("Please select an invoice image to scan.");
      return;
    }
    setIsScanning(true);
    
    // Mock the AI scanning delay
    setTimeout(() => {
      setIsScanning(false);
      // Mock extracted items based on the sample invoice
      setOcrResult([
        { name: "PARLE-G GOLD 800g (Pack of 12)", code: "PG-800", qty: 5 },
        { name: "MAGGI NOODLES 2-MIN 70g (Pack of 48)", code: "MG-70", qty: 3 },
        { name: "SUGAR S-30 5kg Bag", code: "SG-5K", qty: 8 },
        { name: "TATA SALT 1kg (Pack of 20)", code: "TS-1K", qty: 4 },
        { name: "FORTUNE SUNFLOWER OIL 1L (Crtrin of 12)", code: "OIL-1L", qty: 2 },
        { name: "DABUR HONEY 1kg", code: "DH-1K", qty: 6 }
      ]);
    }, 2500);
  };

  const handleOCRConfirm = () => {
    // In a real scenario, this would call an API to update stock
    // For this prototype, we simulate success
    setResult({
      successful: ocrResult.length,
      skipped: 0,
      errors: 0,
      errorDetails: []
    });
    setOcrResult(null);
    setImageFile(null);
  };

  const handleClose = () => {
    setFile(null);
    setImageFile(null);
    setOcrResult(null);
    setResult(null);
    setError(null);
    setIsScanning(false);
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
                Supplier Stock Entry
              </h2>
              <button onClick={handleClose} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                <CloseIcon />
              </button>
            </div>

            {/* Tabs */}
            {!result && !isScanning && !ocrResult && (
              <div className="flex border-b border-gray-200 dark:border-gray-800">
                <button
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'OCR' ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                  onClick={() => { setActiveTab('OCR'); setError(null); }}
                >
                  AI Invoice OCR
                </button>
                <button
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'CSV' ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                  onClick={() => { setActiveTab('CSV'); setError(null); }}
                >
                  Bulk CSV Upload
                </button>
              </div>
            )}

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
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Stock Updated Successfully!</h3>
                  <div className="space-y-2">
                    <p className="text-green-600 dark:text-green-400">✅ {result.successful || 0} {t('products.bulkAdded')}</p>
                    <p className="text-yellow-600 dark:text-yellow-400">⚠️ {result.skipped || 0} {t('products.bulkSkipped')}</p>
                    <p className="text-red-600 dark:text-red-400">❌ {result.errors || 0} {t('products.bulkFailed')}</p>
                  </div>
                </div>
              ) : isScanning ? (
                // --- OCR Scanning Screen ---
                <div className="text-center py-8">
                  <div className="animate-pulse flex justify-center mb-4">
                    <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                      <CameraIcon />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">AI is Extracting Items...</h3>
                  <p className="text-sm text-gray-500">Reading invoice items and quantities. Please wait.</p>
                </div>
              ) : ocrResult ? (
                // --- OCR Result Confirmation Screen ---
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Review Extracted Items</h3>
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700 mb-6">
                    <ul className="space-y-3">
                      {ocrResult.map((item, idx) => (
                        <li key={idx} className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-700 last:border-0 last:pb-0">
                          <div>
                            <span className="font-semibold text-gray-900 dark:text-white">{item.name}</span>
                            <span className="text-xs text-gray-500 ml-2">(Code: {item.code})</span>
                          </div>
                          <span className="font-bold text-green-600 dark:text-green-400">+{item.qty} units</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : activeTab === 'OCR' ? (
                // --- OCR Upload Screen ---
                <div className="space-y-4">
                  <p className="text-gray-600 dark:text-gray-400">
                    Upload a supplier invoice photo. Our AI will automatically extract items and quantities to restock.
                  </p>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-blue-300 dark:border-blue-700/50 border-dashed rounded-xl cursor-pointer bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <CameraIcon />
                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                          <span className="font-semibold text-blue-600 dark:text-blue-400">{imageFile ? imageFile.name : 'Click to take photo or upload'}</span>
                        </p>
                        <p className="text-xs text-gray-500">JPG, PNG, or PDF</p>
                      </div>
                      <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleImageChange} />
                    </label>
                  </div>
                </div>
              ) : (
                // --- CSV Upload Screen ---
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
              <button onClick={handleClose} className="button-secondary mr-3" disabled={isScanning}>
                {result ? t('products.bulkClose') : t('products.bulkCancel')}
              </button>
              
              {!result && !isScanning && !ocrResult && activeTab === 'CSV' && (
                <button
                  onClick={handleCSVSubmit}
                  className="button-primary"
                  disabled={loading || !file}
                >
                  {loading ? t('products.bulkUploading') : t('products.bulkUploadProcess')}
                </button>
              )}
              
              {!result && !isScanning && !ocrResult && activeTab === 'OCR' && (
                <button
                  onClick={handleScanInvoice}
                  className="button-primary bg-gradient-to-r from-blue-600 to-indigo-600 border-none shadow-lg hover:shadow-xl"
                  disabled={!imageFile}
                >
                  Extract with AI
                </button>
              )}

              {ocrResult && (
                <button
                  onClick={handleOCRConfirm}
                  className="button-primary bg-gradient-to-r from-green-500 to-emerald-600 border-none shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Confirm & Update Stock
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}