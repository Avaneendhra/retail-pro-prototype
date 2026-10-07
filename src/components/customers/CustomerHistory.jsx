import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getCustomer, getPurchaseHistory } from "../../services/customerService";
import { downloadBillPdf, generatePdfToken, downloadBillPdfWithFlow, handlePdfDownload } from "../../services/billService";
import { useToast } from "../../context/ToastContext";
import { useTranslation } from 'react-i18next';

export default function CustomerHistory() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [history, setHistory] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!id) return;
    async function fetchData() {
      setLoading(true);
      try {
        const [custData, histData] = await Promise.all([
          getCustomer(id),
          getPurchaseHistory(id)
        ]);
        setCustomer(custData);
        setHistory(histData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      } catch (err) {
        console.error("Error fetching data:", err);
        const errMsg = err.response?.data?.error || t('history.error');
        setError(errMsg);
        showToast(errMsg, 'error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id, showToast, t]);

  const handleDownload = async (bill) => {
    setDownloadingId(bill.billId);
    try {
      showToast(t('history.downloading', { billId: bill.billId }), 'info');

      // Use the complete flow that handles token generation automatically
      const pdfBlob = await downloadBillPdfWithFlow(bill.billId);
      handlePdfDownload(pdfBlob, bill.billId);

      showToast(t('history.downloadSuccess'), 'success');
    } catch (err) {
      console.error('Error downloading PDF:', err);
      const errorMessage = err.response?.data?.message || err.message || t('history.downloadFailed');
      showToast(errorMessage, 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  // Alternative method if you want more control over the process
  const handleDownloadAlternative = async (bill) => {
    setDownloadingId(bill.billId);
    try {
      showToast(t('history.downloading', { billId: bill.billId }), 'info');

      let pdfToken = bill.pdfAccessToken;

      // If no token exists or token might be expired, generate a new one
      if (!pdfToken) {
        const tokenResponse = await generatePdfToken(bill.billId);
        pdfToken = tokenResponse.pdfAccessToken;
      }

      // Download the PDF with the token
      const blob = await downloadBillPdf(bill.billId, pdfToken);

      // Create and trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Bill_${bill.billId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast(t('history.downloadSuccess'), 'success');
    } catch (err) {
      console.error('Error downloading PDF:', err);
      const errorMessage = err.response?.data?.message || err.message || t('history.downloadFailed');
      showToast(errorMessage, 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) return (
    <div className="card p-6 text-center text-gray-500 dark:text-gray-400">
      <div className="flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mr-3"></div>
        {t('history.loading')}
      </div>
    </div>
  );

  if (error) return (
    <div className="card p-6">
      <div className="text-red-500 dark:text-red-400 text-center">
        <p className="font-semibold">{error}</p>
        <button
          onClick={() => window.history.back()}
          className="button-primary mt-4"
        >
          {t('common.goBack')}
        </button>
      </div>
    </div>
  );

  if (!customer) return (
    <div className="card p-6 text-center text-gray-500 dark:text-gray-400">
      {t('history.notFound')}
    </div>
  );

  const formatCurrency = (amount) => {
    return (amount || 0).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      time: date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/customers" className="text-blue-500 dark:text-blue-400 hover:underline text-sm mb-2 inline-flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {t('history.backToCustomers')}
            </Link>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {t('history.title')}
            </h2>
            <p className="text-lg text-cyan-600 dark:text-cyan-400 font-medium">
              {customer.name} • {customer.mobile}
            </p>
            {customer.email && (
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                {customer.email}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('history.totalPurchases')}
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {history.length}
            </p>
          </div>
        </div>
      </div>

      {/* Purchase History */}
      <div className="card p-0 overflow-hidden">
        {history.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-6h6v6m-6-4h.01M12 3v4m0 0h8m-8 0H4" />
            </svg>
            <p className="text-lg text-gray-500 dark:text-gray-400 font-light mb-2">
              {t('history.noHistory')}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {t('history.noHistoryHint')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left py-4 px-6 font-semibold text-gray-700 dark:text-gray-300">
                    {t('history.headerBill')}
                  </th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700 dark:text-gray-300">
                    {t('history.headerDate')}
                  </th>
                  <th className="text-right py-4 px-6 font-semibold text-gray-700 dark:text-gray-300">
                    {t('history.headerTotal')}
                  </th>
                  <th className="text-center py-4 px-6 font-semibold text-gray-700 dark:text-gray-300">
                    {t('history.headerActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((bill) => {
                  const { date, time } = formatDate(bill.createdAt);
                  const total = bill.totalAmount ?? bill.total ?? 0;

                  return (
                    <tr
                      key={bill.billId || bill.id}
                      className="border-b border-gray-200 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <span className="font-mono text-cyan-600 dark:text-cyan-400 font-medium">
                          {bill.billId || "N/A"}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div>
                          <p className="text-gray-900 dark:text-white font-medium">
                            {date}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {time}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(total)}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => handleDownload(bill)}
                          disabled={downloadingId === bill.billId}
                          className="button-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto min-w-[120px]"
                          title={t('history.download')}
                        >
                          {downloadingId === bill.billId ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              {t('common.downloading')}
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              {t('history.download')}
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Stats */}
      {history.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('history.purchaseSummary')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg p-4 text-white">
              <p className="text-sm opacity-90">{t('history.totalBills')}</p>
              <p className="text-2xl font-bold">{history.length}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg p-4 text-white">
              <p className="text-sm opacity-90">{t('history.totalSpent')}</p>
              <p className="text-2xl font-bold">
                {formatCurrency(history.reduce((sum, bill) => sum + (bill.totalAmount || bill.total || 0), 0))}
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-emerald-400 rounded-lg p-4 text-white">
              <p className="text-sm opacity-90">{t('history.avgBill')}</p>
              <p className="text-2xl font-bold">
                {formatCurrency(history.reduce((sum, bill) => sum + (bill.totalAmount || bill.total || 0), 0) / history.length)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}