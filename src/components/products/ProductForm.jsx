import React, { useEffect, useState } from 'react';
import {
  createProductJson,
  createProductMultipart,
  updateProduct,
  updateProductMultipart
} from '../../services/productService';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';

// --- Reusable Icons ---
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const UploadIcon = () => (
  <svg className="w-8 h-8 text-gray-400 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
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

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

export default function ProductForm({ isOpen, onClose, productToEdit }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [product, setProduct] = useState({
    productId: '',
    name: '',
    category: '',
    price: 0,
    quantity: 0,
    reorderLevel: 10,
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isEdit = Boolean(productToEdit);

  useEffect(() => {
    if (isOpen) { // Only run logic when modal opens
      if (isEdit) {
        setLoading(true);
        setProduct({
          productId: productToEdit.productId || '',
          name: productToEdit.name || '',
          category: productToEdit.category || '',
          price: productToEdit.price || 0,
          quantity: productToEdit.quantity || 0,
          reorderLevel: productToEdit.reorderLevel || 10,
        });
        if (productToEdit.imageUrl) {
          setImagePreview(`${API_BASE}${productToEdit.imageUrl}`);
        } else {
          setImagePreview(null);
        }
        setImageFile(null);
        setError(null);
        setLoading(false);
      } else {
        // Reset form for "Add" mode
        setProduct({
          productId: '', name: '', category: '', price: 0, quantity: 0, reorderLevel: 10,
        });
        setImageFile(null);
        setImagePreview(null);
        setError(null);
        setLoading(false);
      }
    }
  }, [productToEdit, isEdit, isOpen]); // Rerun when modal opens

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProduct(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const productData = {
      productId: product.productId,
      name: product.name,
      category: product.category,
      price: Number(product.price),
      quantity: Number(product.quantity),
      reorderLevel: Number(product.reorderLevel),
    };

    try {
      if (isEdit) {
        if (imageFile) {
          await updateProductMultipart(productToEdit.productId, productData, imageFile);
        } else {
          await updateProduct(productToEdit.productId, productData);
        }
        showToast(t('products.toastUpdateSuccess'), 'success');
      } else {
        if (imageFile) {
          await createProductMultipart(productData, imageFile);
        } else {
          await createProductJson(productData);
        }
        showToast(t('products.toastCreateSuccess'), 'success');
      }
      onClose(true); // Close modal and tell list to refresh
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || t('products.toastError');
      setError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
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
          onClick={() => !loading && onClose(false)} // Prevent close while loading
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
                {isEdit ? t('products.formTitleEdit') : t('products.formTitleAdd')}
              </h2>
              <button
                onClick={() => onClose(false)}
                className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                disabled={loading}
              >
                <CloseIcon />
              </button>
            </div>

            {/* --- Modal Body --- */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar">
              {error && (
                <div className="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded-lg mb-4" role="alert">
                  <span className="font-medium">{t('products.error')}:</span> {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* --- Image Uploader --- */}
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t('products.formImage')}
                  </label>
                  <div className="aspect-w-1 aspect-h-1">
                    <div className="w-full h-full border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center text-center relative">
                      {imagePreview ? (
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <div className="flex flex-col items-center">
                          <UploadIcon />
                          <span className="text-sm text-gray-500">{t('products.formImageDrop')}</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={handleImageChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title={isEdit ? t('products.formImageReplace') : t('products.formImageUpload')}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                {/* --- Form Fields --- */}
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="productId" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      {t('products.formId')}
                    </label>
                    <input
                      id="productId"
                      name="productId"
                      type="text"
                      value={product.productId}
                      onChange={handleChange}
                      placeholder={t('products.formIdPlaceholder')}
                      className="form-input"
                      required
                      disabled={isEdit || loading}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      {t('products.formName')}
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={product.name}
                      onChange={handleChange}
                      placeholder={t('products.formNamePlaceholder')}
                      className="form-input"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      {t('products.formCategory')}
                    </label>
                    <input
                      id="category"
                      name="category"
                      type="text"
                      value={product.category}
                      onChange={handleChange}
                      placeholder={t('products.formCategoryPlaceholder')}
                      className="form-input"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="price" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      {t('products.formPrice')}
                    </label>
                    <input
                      id="price"
                      name="price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={product.price}
                      onChange={handleChange}
                      placeholder={t('products.formPricePlaceholder')}
                      className="form-input"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="quantity" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      {t('products.formQuantity')}
                    </label>
                    <input
                      id="quantity"
                      name="quantity"
                      type="number"
                      min="0"
                      step="1"
                      value={product.quantity}
                      onChange={handleChange}
                      placeholder={t('products.formQuantityPlaceholder')}
                      className="form-input"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="reorderLevel" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      {t('products.formReorder')}
                    </label>
                    <input
                      id="reorderLevel"
                      name="reorderLevel"
                      type="number"
                      min="0"
                      step="1"
                      value={product.reorderLevel}
                      onChange={handleChange}
                      placeholder={t('products.formReorderPlaceholder')}
                      className="form-input"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>
            </form>

            {/* --- Modal Footer --- */}
            <div className="flex justify-end items-center p-6 border-t border-gray-200 dark:border-gray-800 flex-shrink-0 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => onClose(false)}
                className="button-secondary mr-3"
                disabled={loading}
              >
                {t('products.formCancel')}
              </button>
              <button
                type="submit"
                onClick={handleSubmit} // Trigger form submit
                className="button-primary"
                disabled={loading}
              >
                {loading
                  ? (isEdit ? t('products.formUpdating') : t('products.formSaving'))
                  : (isEdit ? t('products.formSave') : t('products.formCreate'))}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}