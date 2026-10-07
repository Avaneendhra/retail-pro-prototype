import React, { useState } from "react";
import { getFullReportData, downloadFullReportPdf } from "../../../services/reportService";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import ReportPreview from './ReportPreview';
import { CalendarIcon } from '../../analytics/icons';

// Icons
const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);
const ClearIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const ReportIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6h6v6m-6-4h.01M12 3v4m0 0h8m-8 0H4" />
  </svg>
);
const LoadingSpinner = () => (
  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
);

// UPDATED: Removed hard-coded dark classes
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

export default function ReportGenerator() {
  const { t } = useTranslation();
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)));
  const [endDate, setEndDate] = useState(new Date());

  // Format helpers
  const formatAPI = (d) => d?.toISOString().split('T')[0] || '';
  const formatDateHuman = (d) => {
    if (!d) return t('reports.selectRange');
    return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleGenerateReport = async () => {
    if (!startDate || !endDate) {
      setError(t('reports.errorDate'));
      return;
    }
    if (startDate > endDate) {
      setError(t('reports.errorStartDate'));
      return;
    }
    setLoading(true);
    setError(null);
    setReportData(null);
    try {
      const params = {
        startDate: formatAPI(startDate),
        endDate: formatAPI(endDate),
      };
      const res = await getFullReportData(params);
      setReportData(res);
    } catch (err) {
      console.error("Error fetching report:", err);
      setError(err.message || "Failed to load report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportData) return;
    setIsDownloading(true);
    setError(null);
    try {
      const params = {
        startDate: formatAPI(startDate),
        endDate: formatAPI(endDate),
      };
      const blob = await downloadFullReportPdf(params);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const filename = `SmartRetail_Report_${params.startDate}_to_${params.endDate}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading PDF:", err);
      setError(err.message || "Failed to download PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClearReport = () => {
    setReportData(null);
    setError(null);
  };

  const humanDateRange = {
    start: formatDateHuman(startDate),
    end: formatDateHuman(endDate)
  };

  return (
    // UPDATED: Removed hard-coded background
    <div className="min-h-[calc(100vh-100px)]">
      <div className="max-w-7xl mx-auto"> {/* Removed padding, letting MainLayout handle it */}
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4 bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
            {t('reports.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
            {t('reports.subtitle')}
          </p>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-6 mb-8" // UPDATED: Just "card"
        >
          <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
            {/* Date Picker */}
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">{t('reports.dateRange')}</label>
              <div className="relative">
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
                    setError(null);
                  }}
                  customInput={<CustomDateInput placeholder={t('reports.selectRange')} />}
                  popperClassName="react-datepicker-dark z-50" // This class is in index.css
                  popperPlacement="bottom-start"
                  dateFormat="MMM d, yyyy"
                  showPopperArrow={false}
                  wrapperClassName="w-full"
                  disabled={loading || !!reportData}
                />
              </div>
              {startDate && endDate && (
                <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-2">
                  {humanDateRange.start} to {humanDateRange.end}
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <AnimatePresence mode="wait">
                {!reportData ? (
                  <motion.button
                    key="generate"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={handleGenerateReport}
                    disabled={loading}
                    className="button-primary w-full sm:w-48 h-12 flex items-center justify-center gap-3 font-semibold"
                  >
                    {loading ? <LoadingSpinner /> : <ReportIcon />}
                    {loading ? t('reports.generating') : t('reports.generate')}
                  </motion.button>
                ) : (
                  <motion.div
                    key="actions"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
                  >
                    <button
                      onClick={handleDownloadPdf}
                      disabled={isDownloading}
                      className="button-primary h-12 px-6 flex items-center justify-center gap-3 font-semibold bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                    >
                      {isDownloading ? <LoadingSpinner /> : <DownloadIcon />}
                      {isDownloading ? t('reports.downloading') : t('reports.download')}
                    </button>
                    <button
                      onClick={handleClearReport}
                      disabled={isDownloading}
                      className="button-secondary h-12 px-6 flex items-center justify-center gap-3 font-semibold"
                    >
                      <ClearIcon />
                      {t('reports.newReport')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/20 rounded-lg"
            >
              <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">{error}</span>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="card p-12 text-center"
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('reports.loading')}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{t('reports.loadingSub')}</p>
                </div>
              </div>
            </motion.div>
          )}

          {reportData && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* This component is INTENTIONALLY light-themed for PDF look */}
              <ReportPreview
                reportData={reportData}
                startDate={humanDateRange.start}
                endDate={humanDateRange.end}
              />
            </motion.div>
          )}

          {!loading && !reportData && !error && (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 mx-auto mb-6 bg-gray-200 dark:bg-gradient-to-br dark:from-cyan-500/10 dark:to-blue-500/10 rounded-2xl flex items-center justify-center">
                  {/* UPDATED: Icon color */}
                  <ReportIcon className="w-10 h-10 text-gray-500 dark:text-cyan-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t('reports.placeholderTitle')}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-lg mb-8">
                  {t('reports.placeholderSub')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-500 dark:text-gray-500">
                  <div className="text-center">
                    <div className="w-8 h-8 bg-gray-200 dark:bg-cyan-500/10 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <span className="text-cyan-500 dark:text-cyan-400 font-medium">Chart</span>
                    </div>
                    <p>{t('reports.placeholder1')}</p>
                  </div>
                  <div className="text-center">
                    <div className="w-8 h-8 bg-gray-200 dark:bg-blue-500/10 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <span className="text-blue-500 dark:text-blue-400 font-medium">AI</span>
                    </div>
                    <p>{t('reports.placeholder2')}</p>
                  </div>
                  <div className="text-center">
                    <div className="w-8 h-8 bg-gray-200 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <span className="text-emerald-500 dark:text-emerald-400 font-medium">PDF</span>
                    </div>
                    <p>{t('reports.placeholder3')}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}