import React, { useEffect, useState, useMemo } from 'react';
import { listProducts, deleteProduct } from '../../services/productService';
import ProductForm from './ProductForm';
import BulkUploadModal from './BulkUploadModal';
import Fuse from 'fuse.js';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import authService from '../../services/authService';
import { useCart } from '../../context/CartContext';
import { useTranslation } from 'react-i18next';

// --- Reusable Icons ---
const SearchIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const AddIcon = () => (
  <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
);
const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z" />
  </svg>
);
const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const PlaceholderIcon = () => (
  <svg className="w-16 h-16 text-gray-300 dark:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const SortIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9M3 12h9m-9 4h13m-3-4v8m0 0l-4-4m4 4l4-4" />
  </svg>
);
const AlertIcon = () => (
  <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);
// --- End Icons ---

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

// --- Product Card Component ---
const ProductCard = ({ product, onEdit, onDelete, canManage }) => {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  const { addToCart, cartItems } = useCart();
  const { showToast } = useToast();
  const [quantity, setQuantity] = useState(1);
  const imageUrl = product.imageUrl ? `${API_BASE}${product.imageUrl}` : null;

  const itemInCart = cartItems.find(item => item.productId === product.productId);
  const remainingStock = product.quantity - (itemInCart?.quantity || 0);
  const isLowStock = product.quantity < product.reorderLevel;

  const handleAddToCart = () => {
    const qtyToAdd = Number(quantity);
    if (qtyToAdd > remainingStock) {
      showToast(t('productCard.errorStock', { count: remainingStock }), 'error');
      return;
    }
    if (qtyToAdd > 0) {
      addToCart(product, qtyToAdd);
      showToast(t('productCard.successAdd', { count: qtyToAdd, name: product.name }), 'success');
      setQuantity(1);
    }
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
      {/* Badges */}
      {isLowStock && (
        <div className="absolute top-4 right-4 z-10 bg-red-600/90 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
          {t('productCard.lowStock')}
        </div>
      )}
      {remainingStock <= 0 && product.quantity > 0 && (
        <div className="absolute top-12 right-4 z-10 bg-yellow-600/90 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
          {t('productCard.inCart')}
        </div>
      )}

      {/* Management Buttons */}
      {canManage && (
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <button
            onClick={onEdit}
            className="p-2 bg-gray-900/50 text-white rounded-full
                       opacity-0 group-hover:opacity-100 transition-all duration-300
                       hover:bg-blue-600 hover:scale-110"
            title={t('productCard.edit')}
          >
            <EditIcon />
          </button>
          <button
            onClick={onDelete}
            className="p-2 bg-gray-900/50 text-white rounded-full
                       opacity-0 group-hover:opacity-100 transition-all duration-300
                       hover:bg-red-600 hover:scale-110"
            title={t('productCard.delete')}
          >
            <DeleteIcon />
          </button>
        </div>
      )}

      {/* Image */}
      <div className="aspect-w-1 aspect-h-1 w-full bg-gray-100 dark:bg-gray-800 rounded-t-2xl overflow-hidden">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <PlaceholderIcon />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-5 flex-grow flex flex-col">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate" title={product.name}>
          {product.name || t('productCard.unnamed')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-3">
          {product.category || t('productCard.uncategorized')}
        </p>

        <div className="mt-auto flex justify-between items-end">
          <div className="text-left">
            <p className="text-xs text-gray-500 font-medium">{t('productCard.price')}</p>
            <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400">
              {product.price?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) || '₹0.00'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 font-medium">{t('productCard.inStock')}</p>
            <p className={`text-xl font-bold ${remainingStock <= 0 ? 'text-red-500' : isLowStock ? 'text-yellow-500 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}`}>
              {remainingStock}
            </p>
          </div>
        </div>

        {/* Add to Cart Section */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            min="1"
            max={remainingStock}
            className="form-input w-20 text-center !pl-2"
            disabled={remainingStock <= 0}
          />
          <button
            onClick={handleAddToCart}
            disabled={remainingStock <= 0}
            className="button-primary flex-grow disabled:bg-gray-400 dark:disabled:bg-gray-600"
          >
            {remainingStock <= 0 ? t('productCard.outOfStock') : t('productCard.addToCart')}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// --- Skeleton Card for Loading ---
const SkeletonCard = () => (
  <div className="card relative flex flex-col overflow-hidden animate-pulse">
    <div className="aspect-w-1 aspect-h-1 w-full bg-gray-200 dark:bg-gray-800 rounded-t-2xl"></div>
    <div className="p-5 flex-grow flex flex-col">
      <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
      <div className="mt-auto flex justify-between items-end">
        <div className="w-1/3">
          <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-full mb-1.5"></div>
          <div className="h-5 bg-gray-300 dark:bg-gray-700 rounded w-full"></div>
        </div>
        <div className="w-1/4">
          <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-full mb-1.5"></div>
          <div className="h-5 bg-gray-300 dark:bg-gray-700 rounded w-full"></div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
        <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded w-20"></div>
        <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded flex-grow"></div>
      </div>
    </div>
  </div>
);

// --- Main Product List Component ---
export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState('default');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState(null);

  const { t } = useTranslation();
  const { showToast } = useToast();
  const user = authService.getUserFromToken();
  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const fuse = useMemo(() => new Fuse(products, {
    keys: ['name', 'category', 'productId'],
    threshold: 0.4,
  }), [products]);

  const displayProducts = useMemo(() => {
    const searchedItems = searchTerm
      ? fuse.search(searchTerm).map(result => result.item)
      : [...products];
    const filteredItems = showLowStockOnly
      ? searchedItems.filter(p => p.quantity < p.reorderLevel)
      : searchedItems;
    const sortedItems = [...filteredItems];
    switch (sortBy) {
      case 'name-asc':
        sortedItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'name-desc':
        sortedItems.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        break;
      case 'price-asc':
        sortedItems.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-desc':
        sortedItems.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'qty-asc':
        sortedItems.sort((a, b) => (a.quantity || 0) - (b.quantity || 0));
        break;
      case 'qty-desc':
        sortedItems.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
        break;
      default:
        break;
    }
    return sortedItems;
  }, [products, searchTerm, showLowStockOnly, sortBy, fuse]);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      setError(null);
      const data = await listProducts();
      if (Array.isArray(data)) {
        setProducts(data);
      } else {
        console.error("Invalid products response:", data);
        setProducts([]);
        setError(t('products.errorLoad'));
      }
    } catch (err) {
      console.error("Failed to load products:", err);
      setError(t('products.error'));
    } finally {
      setLoading(false);
    }
  }

  const handleOpenAddModal = () => {
    setProductToEdit(null);
    setIsFormModalOpen(true);
  };
  const handleOpenEditModal = (product) => {
    setProductToEdit(product);
    setIsFormModalOpen(true);
  };
  const handleCloseFormModal = (shouldRefresh = false) => {
    setIsFormModalOpen(false);
    setProductToEdit(null);
    if (shouldRefresh) loadProducts();
  };
  const handleCloseBulkModal = (result) => {
    setIsBulkModalOpen(false);
    if (result && result.successful > 0) loadProducts();
  };

  const handleDeleteProduct = async (product) => {
    if (!product.productId) {
      showToast(t('productCard.errorDeleteMissingId'), 'error');
      return;
    }
    if (!window.confirm(t('productCard.confirmDelete', { name: product.name }))) {
      return;
    }
    try {
      await deleteProduct(product.productId);
      showToast(t('products.deleteSuccess'), 'success');
      loadProducts();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      showToast(t('products.deleteError', { error: errMsg }), 'error');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white font-display">
          {t('products.title')}
          <span className="text-lg font-normal text-gray-500 dark:text-gray-400 ml-3">
            ({displayProducts.length} {t('products.items')})
          </span>
        </h2>
      </div>

      <div className="card mb-6 p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-grow w-full md:w-auto">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('products.searchPlaceholder')}
            className="form-input w-full"
          />
        </div>

        <div className="relative flex-shrink-0 w-full md:w-48">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <SortIcon />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="form-input appearance-none w-full"
          >
            <option value="default">{t('products.sortDefault')}</option>
            <option value="name-asc">{t('products.sortNameAsc')}</option>
            <option value="name-desc">{t('products.sortNameDesc')}</option>
            <option value="price-asc">{t('products.sortPriceAsc')}</option>
            <option value="price-desc">{t('products.sortPriceDesc')}</option>
            <option value="qty-asc">{t('products.sortQtyAsc')}</option>
            <option value="qty-desc">{t('products.sortQtyDesc')}</option>
          </select>
        </div>

        <button
          onClick={() => setShowLowStockOnly(prev => !prev)}
          className={`button-secondary flex-shrink-0 w-full md:w-auto flex items-center justify-center
                      ${showLowStockOnly
                        ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500 dark:bg-yellow-600 dark:text-white dark:hover:bg-yellow-700'
                        : 'button-secondary'}`}
        >
          <AlertIcon />
          {showLowStockOnly ? t('products.showingLowStock') : t('products.showLowStock')}
        </button>

        {canManage && (
          <>
            <button onClick={() => setIsBulkModalOpen(true)} className="button-secondary flex-shrink-0 w-full md:w-auto">
              {t('products.bulkUpload')}
            </button>
            <button onClick={handleOpenAddModal} className="button-primary flex-shrink-0 w-full md:w-auto">
              <AddIcon />
              {t('products.addProduct')}
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="card text-center p-10">
          <p className="text-red-500 dark:text-red-400 font-semibold">{error}</p>
          <button onClick={loadProducts} className="button-primary mt-4">
            {t('products.tryAgain')}
          </button>
        </div>
      ) : displayProducts.length === 0 ? (
        <div className="card text-center p-10">
          <p className="text-gray-600 dark:text-gray-400 font-semibold">
            {searchTerm ? t('products.noMatch') : (showLowStockOnly ? t('products.noLowStock') : t('products.noProducts'))}
          </p>
          <button onClick={() => { setSearchTerm(''); setShowLowStockOnly(false); }} className="button-secondary mt-4">
            {t('products.clearFilters')}
          </button>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          <AnimatePresence>
            {displayProducts.map((p) => {
              const key = p.productId;
              if (!key) {
                 console.warn("Found product without a productId:", p);
                 return null;
              }
              return (
                <ProductCard
                  key={key}
                  product={p}
                  onEdit={() => handleOpenEditModal(p)}
                  onDelete={() => handleDeleteProduct(p)}
                  canManage={canManage}
                />
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* --- Modals --- */}
      <ProductForm
        isOpen={isFormModalOpen}
        onClose={handleCloseFormModal}
        productToEdit={productToEdit}
      />
      <BulkUploadModal
        isOpen={isBulkModalOpen}
        onClose={handleCloseBulkModal}
      />
    </div>
  );
}