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

// --- Icons ---
const SearchIcon = () => (
  <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  <svg className="w-12 h-12 text-[var(--text-muted)] opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const FilterIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="card flex flex-col group overflow-hidden"
    >
      <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-b border-[var(--border)] overflow-hidden">
        {isLowStock && (
          <div className="absolute top-3 right-3 z-10 badge badge-warning shadow-sm backdrop-blur-md">
            {t('productCard.lowStock')}
          </div>
        )}
        {remainingStock <= 0 && product.quantity > 0 && (
          <div className="absolute top-3 right-3 z-10 badge badge-success shadow-sm backdrop-blur-md">
            {t('productCard.inCart')}
          </div>
        )}

        {canManage && (
          <div className="absolute top-3 left-3 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="btn-icon bg-[var(--surface)] shadow-sm" title={t('productCard.edit')}><EditIcon /></button>
            <button onClick={onDelete} className="btn-icon bg-[var(--surface)] text-[var(--danger)] hover:text-white shadow-sm hover:bg-[var(--danger)]" title={t('productCard.delete')}><DeleteIcon /></button>
          </div>
        )}

        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <PlaceholderIcon />
        )}
      </div>

      <div className="p-4 flex flex-col flex-grow">
        <h3 className="font-bold text-[var(--text-primary)] text-lg truncate mb-1">
          {product.name || t('productCard.unnamed')}
        </h3>
        <p className="text-sm font-medium text-[var(--text-muted)] truncate mb-4">
          {product.category || t('productCard.uncategorized')}
        </p>

        <div className="mt-auto flex justify-between items-end mb-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-semibold">{t('productCard.price')}</p>
            <p className="text-lg font-extrabold text-[var(--text-primary)]">
              {product.price?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) || '₹0.00'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-semibold">{t('productCard.inStock')}</p>
            <p className={`text-lg font-bold ${remainingStock <= 0 ? 'text-[var(--danger)]' : isLowStock ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
              {remainingStock} <span className="text-xs font-normal">unit{remainingStock !== 1 && 's'}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            min="1"
            max={remainingStock}
            className="form-input !px-2 text-center font-bold"
            style={{ width: '60px' }}
            disabled={remainingStock <= 0}
          />
          <button
            onClick={handleAddToCart}
            disabled={remainingStock <= 0}
            className="btn btn-primary flex-grow"
          >
            {remainingStock <= 0 ? t('productCard.outOfStock') : t('productCard.addToCart')}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// --- Skeleton Card ---
const SkeletonCard = () => (
  <div className="card flex flex-col overflow-hidden animate-pulse">
    <div className="aspect-[4/3] bg-gray-200 dark:bg-gray-800"></div>
    <div className="p-4 flex-grow flex flex-col">
      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
      <div className="mt-auto flex justify-between items-end mb-4">
        <div className="w-1/3">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-1"></div>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
        </div>
        <div className="w-1/4">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-1"></div>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-[60px] bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-10 flex-grow bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    </div>
  </div>
);

// --- Main Product List ---
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
    const searchedItems = searchTerm ? fuse.search(searchTerm).map(result => result.item) : [...products];
    const filteredItems = showLowStockOnly ? searchedItems.filter(p => p.quantity < p.reorderLevel) : searchedItems;
    const sortedItems = [...filteredItems];
    
    switch (sortBy) {
      case 'name-asc': sortedItems.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
      case 'name-desc': sortedItems.sort((a, b) => (b.name || '').localeCompare(a.name || '')); break;
      case 'price-asc': sortedItems.sort((a, b) => (a.price || 0) - (b.price || 0)); break;
      case 'price-desc': sortedItems.sort((a, b) => (b.price || 0) - (a.price || 0)); break;
      case 'qty-asc': sortedItems.sort((a, b) => (a.quantity || 0) - (b.quantity || 0)); break;
      case 'qty-desc': sortedItems.sort((a, b) => (b.quantity || 0) - (a.quantity || 0)); break;
      default: break;
    }
    return sortedItems;
  }, [products, searchTerm, showLowStockOnly, sortBy, fuse]);

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      setError(null);
      const data = await listProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(t('products.error'));
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteProduct = async (product) => {
    if (!product.productId) return showToast(t('productCard.errorDeleteMissingId'), 'error');
    if (!window.confirm(t('productCard.confirmDelete', { name: product.name }))) return;
    
    try {
      await deleteProduct(product.productId);
      showToast(t('products.deleteSuccess'), 'success');
      loadProducts();
    } catch (err) {
      showToast(t('products.deleteError', { error: err.response?.data?.error || err.message }), 'error');
    }
  };

  return (
    <div className="animate-in">
      <div className="page-header flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="page-title">{t('products.title')}</h1>
          <p className="page-subtitle">Manage your inventory and stock levels.</p>
        </div>
        
        {canManage && (
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => window.location.hash = '#/scan'} className="btn btn-secondary flex-1 md:flex-none">
              Scan
            </button>
            <button onClick={() => setIsBulkModalOpen(true)} className="btn btn-secondary flex-1 md:flex-none">
              Import
            </button>
            <button onClick={() => { setProductToEdit(null); setIsFormModalOpen(true); }} className="btn btn-primary flex-1 md:flex-none shadow-glow">
              <AddIcon /> {t('products.addProduct')}
            </button>
          </div>
        )}
      </div>

      <div className="card-flat mb-6 p-4 flex flex-col md:flex-row gap-4 items-center bg-[var(--surface)]">
        <div className="relative flex-grow w-full md:w-auto">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products by name, category, or SKU..."
            className="form-input w-full"
          />
        </div>

        <div className="relative flex-shrink-0 w-full md:w-48">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="form-input w-full cursor-pointer appearance-none">
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
          onClick={() => setShowLowStockOnly(!showLowStockOnly)}
          className={`btn flex-shrink-0 w-full md:w-auto ${showLowStockOnly ? 'btn-danger' : 'btn-secondary'}`}
        >
          <FilterIcon className="w-4 h-4 mr-2" />
          {showLowStockOnly ? t('products.showingLowStock') : t('products.showLowStock')}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="card text-center p-12">
          <p className="text-[var(--danger)] font-semibold mb-4">{error}</p>
          <button onClick={loadProducts} className="btn btn-primary">{t('products.tryAgain')}</button>
        </div>
      ) : displayProducts.length === 0 ? (
        <div className="card text-center p-16 flex flex-col items-center">
          <PlaceholderIcon />
          <h3 className="text-lg font-bold mt-4 text-[var(--text-primary)]">No products found</h3>
          <p className="text-[var(--text-muted)] mt-1 mb-6">
            {searchTerm ? t('products.noMatch') : (showLowStockOnly ? t('products.noLowStock') : t('products.noProducts'))}
          </p>
          <button onClick={() => { setSearchTerm(''); setShowLowStockOnly(false); }} className="btn btn-secondary">
            {t('products.clearFilters')}
          </button>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
          <AnimatePresence>
            {displayProducts.map((p) => p.productId && (
              <ProductCard
                key={p.productId}
                product={p}
                onEdit={() => { setProductToEdit(p); setIsFormModalOpen(true); }}
                onDelete={() => handleDeleteProduct(p)}
                canManage={canManage}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <ProductForm isOpen={isFormModalOpen} onClose={(shouldRefresh) => { setIsFormModalOpen(false); if (shouldRefresh) loadProducts(); }} productToEdit={productToEdit} />
      <BulkUploadModal isOpen={isBulkModalOpen} onClose={(result) => { setIsBulkModalOpen(false); if (result?.successful > 0) loadProducts(); }} />
    </div>
  );
}