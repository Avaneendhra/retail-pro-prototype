import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listBills,
  downloadBillPdf,
  resendBillEmail,
  generatePdfToken,
  downloadBillPdfWithFlow,
  handlePdfDownload
} from '../../services/billService';
import { useToast } from '../../context/ToastContext';
import authService from '../../services/authService';
import Fuse from 'fuse.js';
import { motion, AnimatePresence } from 'framer-motion';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { useTranslation } from 'react-i18next';

// --- ICONS ---
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
const CalendarIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const ExportIcon = () => (
  <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);
const PdfIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const ResendIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const CheckCircleIcon = () => (
  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
// --- END ICONS ---

// --- Skeleton Row ---
const SkeletonRow = () => (
  <tr className="animate-pulse">
    <td><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div></td>
    <td><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div></td>
    <td><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div></td>
    <td><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-36"></div></td>
    <td><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div></td>
    <td className="flex gap-2 justify-center">
      <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
    </td>
  </tr>
);

// --- Customer Avatar Component ---
const CustomerAvatar = ({ name, className = "w-8 h-8" }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'WI';
  const colors = [
    'bg-gradient-to-br from-blue-500 to-cyan-400',
    'bg-gradient-to-br from-purple-500 to-pink-500',
    'bg-gradient-to-br from-orange-500 to-red-500',
    'bg-gradient-to-br from-green-500 to-emerald-400',
    'bg-gradient-to-br from-indigo-500 to-purple-400'
  ];
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;

  return (
    <div className={`${className} ${colors[colorIndex]} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg`}>
      {initials}
    </div>
  );
};

// --- Bill Details Drawer ---
const BillDetailsDrawer = ({ bill, isOpen, onClose, t, onDownload, onResend }) => {
  if (!isOpen) return null;

  const { date, time } = formatDate(bill.createdAt || bill.date);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></motion.div>

      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900/95 dark:backdrop-blur-xl border-l border-gray-200 dark:border-gray-700/50 shadow-2xl"
      >
        <div className="p-6 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('billList.drawerTitle')}</h3>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar pr-2">
            {/* Bill Info */}
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">{t('billList.headerId')}</label>
                <p className="text-lg font-mono text-cyan-600 dark:text-cyan-400">{bill.billId}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">{t('billList.drawerDate')}</label>
                <p className="text-gray-900 dark:text-white">{date} at {time}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400">{t('billList.drawerTotal')}</label>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(bill.totalAmount)}
                </p>
              </div>
            </div>

            {/* Customer Info */}
            <div className="space-y-3">
              <label className="text-sm text-gray-500 dark:text-gray-400">{t('billList.drawerCustomer')}</label>
              <div className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-800/50 rounded-lg">
                <CustomerAvatar name={bill.customer?.name} />
                <div>
                  <p className="text-gray-900 dark:text-white font-medium">{bill.customer?.name || t('billList.walkIn')}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{bill.customer?.mobile || t('billList.noMobile')}</p>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <label className="text-sm text-gray-500 dark:text-gray-400">{t('billList.drawerItems', { count: bill.items?.length || 0 })}</label>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {bill.items?.map((item, index) => (
                  <div key={index} className="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-800/30 rounded">
                    <span className="text-gray-800 dark:text-white text-sm">{item.productName || item.name}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 text-sm">
                      {formatCurrency(item.price)} x {item.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => onDownload(bill)}
              className="w-full button-primary flex items-center justify-center gap-2"
            >
              <PdfIcon />
              {t('billList.downloadPDF')}
            </button>
            <button
              onClick={() => onResend(bill.billId)}
              className="w-full button-secondary flex items-center justify-center gap-2"
            >
              <ResendIcon />
              {t('billList.resendEmail')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// Formatting Helpers
const formatCurrency = (amount) => {
  return (amount || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
};

const formatDate = (dateString) => {
  if (!dateString) return { date: 'N/A', time: '' };
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  };
};

// Custom DatePicker Input Component
const CustomDateInput = React.forwardRef(({ value, onClick, placeholder }, ref) => (
  <button
    type="button"
    ref={ref}
    onClick={onClick}
    className="form-input w-full !pl-10 !py-3 rounded-xl cursor-pointer text-left"
  >
    <span className={value ? 'text-gray-800 dark:text-white' : 'text-gray-500'}>
      {value || placeholder}
    </span>
  </button>
));

export default function BillList() {
  const { t } = useTranslation();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('createdAt-desc');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [autoEmail, setAutoEmail] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { showToast } = useToast();
  const navigate = useNavigate();
  const user = authService.getUserFromToken();
  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const fuse = useMemo(() => new Fuse(bills, {
    keys: ['billId', 'customer.name', 'customer.mobile', 'paymentMethod'],
    threshold: 0.4,
  }), [bills]);

  const displayBills = useMemo(() => {
    let items = searchTerm ? fuse.search(searchTerm).map(r => r.item) : [...bills];

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate.setHours(0, 0, 0, 0)) : new Date(0);
      const end = endDate ? new Date(endDate.setHours(23, 59, 59, 999)) : new Date();
      items = items.filter(b => {
        const billDate = new Date(b.createdAt || b.date);
        return billDate >= start && billDate <= end;
      });
    }

    const [key, dir] = sortBy.split('-');
    return [...items].sort((a, b) => {
      let valA = key === 'createdAt' ? new Date(a.createdAt || a.date).getTime() : (a.totalAmount || 0);
      let valB = key === 'createdAt' ? new Date(b.createdAt || b.date).getTime() : (b.totalAmount || 0);
      return dir === 'asc' ? valA - valB : valB - valA;
    });
  }, [bills, searchTerm, sortBy, startDate, endDate, fuse]);

  const totalPages = Math.ceil(displayBills.length / itemsPerPage);
  const paginatedBills = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return displayBills.slice(startIndex, startIndex + itemsPerPage);
  }, [displayBills, currentPage, itemsPerPage]);

  useEffect(() => { loadBills(); }, []);

  async function loadBills() {
    try {
      setLoading(true);
      setError(null);
      const data = await listBills();
      setBills(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleDownload = async (bill, e) => {
    e?.stopPropagation();
    setDownloadingId(bill.billId);
    try {
      showToast(t('billList.downloading', { billId: bill.billId }), 'info');

      // Use the complete flow that handles token generation automatically
      const pdfBlob = await downloadBillPdfWithFlow(bill.billId);
      handlePdfDownload(pdfBlob, bill.billId);

      showToast(t('billList.downloadSuccess'), 'success');
    } catch (err) {
      console.error('Error downloading PDF:', err);
      const errorMessage = err.response?.data?.message || err.message || t('billList.downloadFailed');
      showToast(errorMessage, 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleResend = async (billId, e) => {
    e?.stopPropagation();
    setResendingId(billId);
    try {
      await resendBillEmail(billId);
      showToast(t('billList.resendSuccess'), 'success');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || t('billList.resendFailed');
      showToast(errorMessage, 'error');
    } finally {
      setResendingId(null);
    }
  };

  const handleRowClick = (bill) => {
    setSelectedBill(bill);
    setIsDrawerOpen(true);
  };

  const handleDrawerDownload = async (bill) => {
    try {
      showToast(t('billList.downloading', { billId: bill.billId }), 'info');
      const pdfBlob = await downloadBillPdfWithFlow(bill.billId);
      handlePdfDownload(pdfBlob, bill.billId);
      showToast(t('billList.downloadSuccess'), 'success');
    } catch (err) {
      console.error('Error downloading PDF:', err);
      const errorMessage = err.response?.data?.message || err.message || t('billList.downloadFailed');
      showToast(errorMessage, 'error');
    }
  };

  const handleDrawerResend = async (billId) => {
    try {
      await resendBillEmail(billId);
      showToast(t('billList.resendSuccess'), 'success');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || t('billList.resendFailed');
      showToast(errorMessage, 'error');
    }
  };

  const exportToCsv = () => {
    if (!displayBills.length) return showToast(t('billList.exportError'), 'error');
    const headers = ["Bill ID", "Customer", "Mobile", "Amount", "Date", "Items", "Payment Method"];
    const rows = displayBills.map(b => [
      b.billId,
      b.customer?.name || '',
      b.customer?.mobile || '',
      formatCurrency(b.totalAmount),
      new Date(b.createdAt || b.date).toLocaleString(),
      b.items?.length || 0,
      b.paymentMethod || 'cash'
    ]);
    const csv = [headers, ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SmartRetail_Bills_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('billList.exportSuccess', { count: displayBills.length }), 'success');
  };

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <svg className="w-16 h-16 text-gray-400 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-6h6v6m-6-4h.01M12 3v4m0 0h8m-8 0H4" />
      </svg>
      <p className="text-lg text-gray-500 dark:text-gray-400 font-light">{t('billList.emptyState')}</p>
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t('billList.emptyStateHint')}</p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Frosted Header Bar */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 dark:bg-black/40 border-b border-gray-200 dark:border-cyan-500/20 p-4 rounded-xl flex justify-between items-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white font-display">
          {t('billList.title')}
          <span className="text-lg font-normal text-gray-500 dark:text-gray-400 ml-3">
            ({displayBills.length} {t('billList.matching')})
          </span>
        </h2>
        {canManage && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={autoEmail}
                  onChange={(e) => setAutoEmail(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-10 h-6 rounded-full transition-colors ${
                  autoEmail ? 'bg-cyan-500' : 'bg-gray-400 dark:bg-gray-600'
                }`}></div>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoEmail ? 'transform translate-x-5' : 'transform translate-x-1'
                }`}></div>
              </div>
              {t('billList.autoEmail')}
            </label>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="card p-5 rounded-2xl">
        <div className="flex flex-col lg:flex-row gap-4 items-center">
          <div className="relative flex-grow w-full md:w-auto">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none z-10">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t('billList.searchPlaceholder')}
              className="form-input w-full !py-3 rounded-xl transition-all"
            />
          </div>

          <div className="relative flex-shrink-0 w-full md:w-64">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none z-10">
              <CalendarIcon />
            </div>
            <DatePicker
              selectsRange
              startDate={startDate}
              endDate={endDate}
              onChange={([start, end]) => {
                setStartDate(start);
                setEndDate(end);
                setCurrentPage(1);
              }}
              isClearable
              placeholderText={t('billList.datePlaceholder')}
              customInput={<CustomDateInput placeholder={t('billList.datePlaceholder')} />}
              className="w-full"
              popperClassName="react-datepicker-dark z-50"
              popperPlacement="bottom-start"
              dateFormat="MMM d, yyyy"
              showPopperArrow={false}
              wrapperClassName="w-full"
            />
          </div>

          <div className="relative flex-shrink-0 w-full md:w-56">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none z-10">
              <SortIcon />
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="form-input appearance-none w-full !py-3 rounded-xl"
            >
              <option value="createdAt-desc">{t('billList.sortNewest')}</option>
              <option value="createdAt-asc">{t('billList.sortOldest')}</option>
              <option value="totalAmount-desc">{t('billList.sortHigh')}</option>
              <option value="totalAmount-asc">{t('billList.sortLow')}</option>
            </select>
          </div>

          {canManage && (
            <button
              onClick={exportToCsv}
              className="button-secondary !px-6 !py-3 rounded-xl flex items-center justify-center gap-2 flex-shrink-0 w-full md:w-auto font-semibold transition-all duration-200"
            >
              <ExportIcon />
              {t('billList.export')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card text-center p-10">
          <p className="text-red-500 dark:text-red-400 font-semibold">{error}</p>
          <button onClick={loadBills} className="button-primary mt-4">{t('common.tryAgain')}</button>
        </div>
      )}

      {!error && (
        <div className="card overflow-x-auto rounded-2xl p-0">
          <table className="table w-full">
            <thead>
              <tr>
                <th className="text-left">{t('billList.headerId')}</th>
                <th className="text-left">{t('billList.headerCustomer')}</th>
                <th className="text-right">{t('billList.headerTotal')}</th>
                <th className="text-left">{t('billList.headerDate')}</th>
                <th className="text-left">{t('billList.headerPayment')}</th>
                <th className="text-left">{t('billList.headerStatus')}</th>
                <th className="text-center">{t('billList.headerActions')}</th>
              </tr>
            </thead>
            <motion.tbody layout>
              <AnimatePresence>
                {loading ? (
                  Array(5).fill().map((_, i) => <SkeletonRow key={i} />)
                ) : paginatedBills.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      <EmptyState />
                    </td>
                  </tr>
                ) : (
                  paginatedBills.map((bill, i) => {
                    const { date, time } = formatDate(bill.createdAt || bill.date);
                    return (
                      <motion.tr
                        key={bill.billId}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.02, duration: 0.2 }}
                        className="hover:bg-gray-50 dark:hover:bg-cyan-500/5 transition-all duration-200 cursor-pointer group"
                        onClick={() => handleRowClick(bill)}
                      >
                        <td className="font-mono text-cyan-600 dark:text-cyan-400">{bill.billId}</td>
                        <td className="min-w-[200px]">
                          <div className="flex items-center gap-3">
                            <CustomerAvatar name={bill.customer?.name} />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                                {bill.customer?.name || t('billList.walkIn')}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{bill.customer?.mobile || t('billList.noMobile')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-right font-bold text-emerald-600 dark:text-emerald-400 min-w-[120px]">
                          {formatCurrency(bill.totalAmount)}
                        </td>
                        <td className="min-w-[170px]">
                          <div>
                            <p className="text-gray-900 dark:text-white font-medium">{date}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{time}</p>
                          </div>
                        </td>
                        <td>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            bill.paymentMethod === 'upi' ? 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30' :
                            bill.paymentMethod === 'card' ? 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30' :
                            bill.paymentMethod === 'credit' ? 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30' :
                            'bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/30'
                          }`}>
                            {bill.paymentMethod?.toUpperCase() || t('billList.paymentMethod')}
                          </span>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200 dark:bg-gradient-to-r dark:from-green-700 dark:to-emerald-500/60 dark:text-green-200 dark:border-emerald-400/50 dark:shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                            <CheckCircleIcon />
                            {t('billList.statusCompleted')}
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="flex justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => handleDownload(bill, e)}
                              disabled={downloadingId === bill.billId}
                              className="p-2 rounded-lg bg-blue-500 dark:bg-gradient-to-br dark:from-blue-500 dark:to-cyan-600 text-white shadow-md hover:shadow-lg transform hover:scale-105 transition-all disabled:opacity-50"
                              title={t('billList.downloadPDF')}
                            >
                              {downloadingId === bill.billId ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              ) : (
                                <PdfIcon />
                              )}
                            </button>
                            <button
                              onClick={(e) => handleResend(bill.billId, e)}
                              disabled={resendingId === bill.billId}
                              className="p-2 rounded-lg bg-purple-500 dark:bg-gradient-to-br dark:from-purple-500 dark:to-pink-600 text-white shadow-md hover:shadow-lg transform hover:scale-105 transition-all disabled:opacity-50"
                              title={t('billList.resendEmail')}
                            >
                              {resendingId === bill.billId ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              ) : (
                                <ResendIcon />
                              )}
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </motion.tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700/50">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('billList.showing', {
                  start: ((currentPage - 1) * itemsPerPage) + 1,
                  end: Math.min(currentPage * itemsPerPage, displayBills.length),
                  total: displayBills.length
                })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('common.previous')}
                </button>
                <span className="px-3 py-1 rounded-lg bg-cyan-500 text-white">
                  {currentPage}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bill Details Drawer */}
      <BillDetailsDrawer
        bill={selectedBill}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        t={t}
        onDownload={handleDrawerDownload}
        onResend={handleDrawerResend}
      />
    </motion.div>
  );
}