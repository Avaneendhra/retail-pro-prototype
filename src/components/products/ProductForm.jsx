import React, { useEffect, useState, useRef } from 'react';
import {
  createProductJson,
  createProductMultipart,
  updateProduct,
  updateProductMultipart
} from '../../services/productService';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';

// --- Reusable Icons ---
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const UploadIcon = () => (
  <svg className="w-8 h-8 text-[var(--text-muted)] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);
const ScanIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
  </svg>
);

const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const modalVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

// Mock database for auto-filling scanned products
const mockProductDB = {
  '8901030985551': { name: 'Maggi 2-Minute Noodles', category: 'Grocery', price: 14 },
  '8901262150821': { name: 'Amul Butter 100g', category: 'Dairy', price: 58 },
  '8901719280041': { name: 'Parachute Coconut Oil', category: 'Personal Care', price: 40 },
  '8901058850654': { name: 'Coca Cola 1.25L', category: 'Beverages', price: 65 },
  '8901314332306': { name: 'Dairy Milk Silk', category: 'Snacks', price: 80 },
  'default': { name: 'Unknown Scanned Product', category: 'General', price: 0 }
};

export default function ProductForm({ isOpen, onClose, productToEdit }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [product, setProduct] = useState({
    productId: '', name: '', category: '', price: 0, quantity: 0, reorderLevel: 10,
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Scanner State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const scannerRef = useRef(null);
  const html5QrcodeRef = useRef(null);

  const isEdit = Boolean(productToEdit);

  useEffect(() => {
    if (isOpen) {
      if (isEdit) {
        setProduct({
          productId: productToEdit.productId || '',
          name: productToEdit.name || '',
          category: productToEdit.category || '',
          price: productToEdit.price || 0,
          quantity: productToEdit.quantity || 0,
          reorderLevel: productToEdit.reorderLevel || 10,
        });
        setImagePreview(productToEdit.imageUrl ? `${API_BASE}${productToEdit.imageUrl}` : null);
      } else {
        setProduct({ productId: '', name: '', category: '', price: 0, quantity: 0, reorderLevel: 10 });
        setImagePreview(null);
      }
      setImageFile(null);
      setError(null);
      setIsScannerOpen(false);
    }
  }, [productToEdit, isEdit, isOpen]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProduct(prev => ({ ...prev, [name]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const productData = { ...product, price: Number(product.price), quantity: Number(product.quantity), reorderLevel: Number(product.reorderLevel) };

    try {
      if (isEdit) {
        if (imageFile) await updateProductMultipart(productToEdit.productId, productData, imageFile);
        else await updateProduct(productToEdit.productId, productData);
        showToast(t('products.toastUpdateSuccess'), 'success');
      } else {
        if (imageFile) await createProductMultipart(productData, imageFile);
        else await createProductJson(productData);
        showToast(t('products.toastCreateSuccess'), 'success');
      }
      onClose(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('products.toastError'));
      showToast('Error saving product', 'error');
    } finally {
      setLoading(false);
    }
  }

  // --- Scanner Logic ---
  const openScanner = () => {
    setIsScannerOpen(true);
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        setCameras(devices);
        const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
        setSelectedCameraId(backCam ? backCam.id : devices[0].id);
      }
    }).catch(console.warn);
  };

  useEffect(() => {
    if (isScannerOpen && selectedCameraId) {
      const html5Qrcode = new Html5Qrcode("inline-barcode-reader");
      html5QrcodeRef.current = html5Qrcode;

      const config = { fps: 10, qrbox: { width: 250, height: 100 }, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
      html5Qrcode.start(
        selectedCameraId,
        config,
        (decodedText) => {
          html5Qrcode.stop();
          html5QrcodeRef.current = null;
          setIsScannerOpen(false);
          handleScannedBarcode(decodedText);
        },
        () => {}
      ).catch(console.error);
    }
    return () => {
      if (html5QrcodeRef.current) {
        try { html5QrcodeRef.current.stop(); } catch(e){}
      }
    };
  }, [isScannerOpen, selectedCameraId]);

  const handleScannedBarcode = (code) => {
    showToast(`Scanned Code: ${code}`, 'success');
    const mockData = mockProductDB[code] || mockProductDB['default'];
    setProduct(prev => ({
      ...prev,
      productId: code,
      name: prev.name || mockData.name,
      category: prev.category || mockData.category,
      price: prev.price === 0 ? mockData.price : prev.price
    }));
  };

  const stopScanner = () => {
    setIsScannerOpen(false);
    if (html5QrcodeRef.current) {
      try { html5QrcodeRef.current.stop(); } catch(e){}
      html5QrcodeRef.current = null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div variants={backdropVariants} initial="hidden" animate="visible" exit="hidden" className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="card max-w-2xl w-full max-h-[95vh] flex flex-col bg-[var(--surface)]">
            <div className="flex justify-between items-center p-6 border-b border-[var(--border)] flex-shrink-0">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                {isEdit ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button onClick={() => onClose(false)} className="btn-icon" disabled={loading}><CloseIcon /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar">
              {error && <div className="bg-[var(--danger)]/10 border border-[var(--danger)] text-[var(--danger)] px-4 py-3 rounded-lg mb-4">{error}</div>}

              {isScannerOpen && (
                <div className="mb-6 p-4 border border-[var(--border)] rounded-xl bg-[var(--surface-hover)]">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-[var(--text-primary)]">Scan Barcode</h3>
                    <button type="button" onClick={stopScanner} className="text-[var(--danger)] text-sm font-semibold hover:underline">Close Scanner</button>
                  </div>
                  {cameras.length > 1 && (
                    <select 
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className="form-input mb-3 w-full text-sm py-2"
                    >
                      {cameras.map(c => <option key={c.id} value={c.id}>{c.label || `Camera ${c.id.substring(0,5)}`}</option>)}
                    </select>
                  )}
                  <div className="w-full bg-black rounded-lg overflow-hidden flex justify-center items-center" style={{ minHeight: '150px' }}>
                    <div id="inline-barcode-reader" className="w-full"></div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Product Image</label>
                  <div className="aspect-w-1 aspect-h-1">
                    <div className="w-full h-full border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] rounded-xl flex items-center justify-center text-center relative transition-colors">
                      {imagePreview ? (
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <div className="flex flex-col items-center">
                          <UploadIcon />
                          <span className="text-xs text-[var(--text-muted)] font-medium">Click to Upload</span>
                        </div>
                      )}
                      <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={loading} />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 relative">
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Barcode / ID</label>
                    <div className="flex gap-2">
                      <input
                        name="productId"
                        type="text"
                        value={product.productId}
                        onChange={handleChange}
                        placeholder="Scan or enter code"
                        className="form-input flex-grow font-mono font-bold"
                        required
                        disabled={isEdit || loading}
                      />
                      {!isEdit && (
                        <button type="button" onClick={openScanner} className="btn btn-primary px-4 shadow-glow" title="Scan Barcode">
                          <ScanIcon />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Product Name</label>
                    <input name="name" type="text" value={product.name} onChange={handleChange} placeholder="e.g. Parle-G" className="form-input w-full" required disabled={loading} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Category</label>
                    <input name="category" type="text" value={product.category} onChange={handleChange} placeholder="e.g. Snacks" className="form-input w-full" disabled={loading} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Price (₹)</label>
                    <input name="price" type="number" min="0" step="0.01" value={product.price} onChange={handleChange} placeholder="0.00" className="form-input w-full font-bold text-[var(--primary)]" required disabled={loading} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Initial Stock</label>
                    <input name="quantity" type="number" min="0" step="1" value={product.quantity} onChange={handleChange} className="form-input w-full" required disabled={loading} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Reorder Alert Level</label>
                    <input name="reorderLevel" type="number" min="0" step="1" value={product.reorderLevel} onChange={handleChange} className="form-input w-full text-[var(--warning)] font-bold" required disabled={loading} />
                  </div>
                </div>
              </div>
            </form>

            <div className="flex justify-end items-center p-6 border-t border-[var(--border)] bg-[var(--surface-hover)] rounded-b-2xl flex-shrink-0">
              <button type="button" onClick={() => onClose(false)} className="btn btn-secondary mr-3" disabled={loading}>Cancel</button>
              <button type="submit" onClick={handleSubmit} className="btn btn-primary px-8 shadow-glow" disabled={loading}>
                {loading ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}