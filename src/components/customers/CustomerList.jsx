import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCustomers, deleteCustomer } from '../../services/customerService';
import { listBills } from '../../services/billService';
import authService from '../../services/authService';
import Fuse from 'fuse.js';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';
import CustomerCard from './CustomerCard';
import SendEmailModal from './SendEmailModal';

// --- Icons ---
const SearchIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const SortIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9M3 12h9m-9 4h13m-3-4v8m0 0l-4-4m4 4l4-4" />
  </svg>
);
const FilterIcon = () => (
  <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);
const EmailIcon = () => (
  <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
// --- End Icons ---

// --- Skeleton Card ---
const SkeletonCard = () => (
  <div className="card relative flex flex-col overflow-hidden animate-pulse">
    <div className="aspect-w-1 aspect-h-1 w-full bg-gray-200 dark:bg-gray-800 rounded-t-2xl"></div>
    <div className="p-5 flex-grow flex flex-col">
      <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-end">
        <div className="w-1/3"><div className="h-5 bg-gray-300 dark:bg-gray-700 rounded w-full"></div></div>
        <div className="w-1/4"><div className="h-5 bg-gray-300 dark:bg-gray-700 rounded w-full"></div></div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded w-full"></div>
        <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded w-full"></div>
      </div>
    </div>
  </div>
);

export default function CustomerList() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('name-asc');
  const [filter, setFilter] = useState('all');
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState([]);

  const { showToast } = useToast();
  const navigate = useNavigate();
  const user = authService.getUserFromToken();
  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const fuse = useMemo(() => new Fuse(customers, {
    keys: ['name', 'email', 'mobile'],
    threshold: 0.4,
  }), [customers]);

  const displayCustomers = useMemo(() => {
    let items = searchTerm
      ? fuse.search(searchTerm).map(r => r.item)
      : [...customers];

    if (filter === 'inactive') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      items = items.filter(c => !c.lastPurchaseDate || new Date(c.lastPurchaseDate) < thirtyDaysAgo);
    }

    const [key, direction] = sortBy.split('-');
    return [...items].sort((a, b) => {
      let valA = a[key] ?? (key === 'lastPurchaseDate' ? 0 : '');
      let valB = b[key] ?? (key === 'lastPurchaseDate' ? 0 : '');
      if (key === 'lastPurchaseDate') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else if (key === 'totalPurchaseCount') {
        valA = valA || 0;
        valB = valB || 0;
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }
      return (valA < valB ? -1 : 1) * (direction === 'asc' ? 1 : -1);
    });
  }, [customers, searchTerm, filter, sortBy, fuse]);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      setLoading(true);
      setError(null);
      const [customerData, billData] = await Promise.all([
        listCustomers(),
        listBills()
      ]);
      if (!Array.isArray(customerData) || !Array.isArray(billData)) {
        throw new Error("Invalid data from server");
      }
      const billMap = new Map();
      billData.forEach(bill => bill.billId && billMap.set(bill.billId, bill));
      const processed = customerData.map(customer => {
        let totalCount = 0;
        let latestDate = null;
        if (customer.purchaseHistory?.length > 0) {
          totalCount = customer.purchaseHistory.length;
          customer.purchaseHistory.forEach(billId => {
            const bill = billMap.get(billId);
            if (bill?.createdAt) {
              const date = new Date(bill.createdAt);
              if (!latestDate || date > latestDate) latestDate = date;
            }
          });
        }
        return {
          ...customer,
          totalPurchaseCount: totalCount,
          lastPurchaseDate: latestDate ? latestDate.toISOString() : null
        };
      });
      setCustomers(processed);
    } catch (err) {
      console.error("Failed to load customers:", err);
      const msg = "Failed to load data. Please try again.";
      setError(msg);
      showToast(err.message || msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleViewHistory = (customer) => {
    navigate(`/customers/${customer.id}/history`);
  };

  const handleOpenEmailModal = (customer) => {
    setSelectedCustomers([customer]);
    setIsEmailModalOpen(true);
  };

  const handleSendToAll = () => {
    if (window.confirm(t('customerList.emailAllConfirm', { count: customers.length }))) {
      setSelectedCustomers(customers);
      setIsEmailModalOpen(true);
    }
  };

  const handleCloseEmailModal = (didSend = false) => {
    setIsEmailModalOpen(false);
    setSelectedCustomers([]);
    if (didSend) showToast('Email(s) sent!', 'success');
  };

  const handleDeleteCustomer = async (customer) => {
    if (!customer.id) {
      showToast('Cannot delete: Missing customer ID.', 'error');
      return;
    }
    if (!window.confirm(t('customerList.deleteConfirm', { name: customer.name || 'this customer' }))) {
      return;
    }
    try {
      await deleteCustomer(customer.id);
      showToast(t('customerList.deleteSuccess'), 'success');
      loadCustomers(); // Refresh
    } catch (err) {
      const msg = err.error || err.message || t('customerList.deleteError');
      showToast(msg, 'error');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white font-display">
          {t('customerList.title')}
          <span className="text-lg font-normal text-gray-500 dark:text-gray-400 ml-3">
            ({displayCustomers.length} {t('customerList.matching')})
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
            placeholder={t('customerList.searchPlaceholder')}
            className="form-input w-full"
          />
        </div>

        <div className="relative flex-shrink-0 w-full md:w-56">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <SortIcon />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="form-input appearance-none w-full"
            aria-label={t('customerList.sort')}
          >
            <option value="name-asc">{t('customerList.sortNameAsc')}</option>
            <option value="name-desc">{t('customerList.sortNameDesc')}</option>
            <option value="lastPurchaseDate-desc">{t('customerList.sortDateDesc')}</option>
            <option value="lastPurchaseDate-asc">{t('customerList.sortDateAsc')}</option>
            <option value="totalPurchaseCount-desc">{t('customerList.sortPurchaseDesc')}</option>
          </select>
        </div>

        <div className="relative flex-shrink-0 w-full md:w-56">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <FilterIcon />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="form-input appearance-none w-full"
          >
            <option value="all">{t('customerList.filter')}</option>
            <option value="inactive">{t('customerList.filterInactive')}</option>
          </select>
        </div>

        {canManage && (
          <button
            onClick={handleSendToAll}
            className="button-primary flex-shrink-0 w-full md:w-auto flex items-center justify-center"
            disabled={customers.length === 0}
          >
            <EmailIcon />
            {t('customerList.emailAll')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="card text-center p-10">
          <p className="text-red-500 dark:text-red-400 font-semibold">{error}</p>
          <button onClick={loadCustomers} className="button-primary mt-4">
            {t('customerList.tryAgain')}
          </button>
        </div>
      ) : displayCustomers.length === 0 ? (
        <div className="card text-center p-10">
          <p className="text-gray-600 dark:text-gray-400 font-semibold">
            {searchTerm ? t('customerList.noMatch') : filter !== 'all' ? t('customerList.noFilterMatch') : t('customerList.noCustomers')}
          </p>
          <button onClick={() => { setSearchTerm(''); setFilter('all'); }} className="button-secondary mt-4">
            {t('customerList.clearFilters')}
          </button>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          <AnimatePresence>
            {displayCustomers.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                onSendEmail={handleOpenEmailModal}
                onViewHistory={handleViewHistory}
                onDelete={handleDeleteCustomer}
                canManage={canManage}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <SendEmailModal
        isOpen={isEmailModalOpen}
        onClose={handleCloseEmailModal}
        selectedCustomers={selectedCustomers}
      />
    </div>
  );
}