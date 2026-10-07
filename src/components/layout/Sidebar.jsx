import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import authService from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useCart } from '../../context/CartContext';

// --- Icons ---
const LogoIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
);

const DashboardIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
  </svg>
);

const ProductsIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const BillsIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const CustomersIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const ReportsIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const ScanIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
  </svg>
);

const PosIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const SunIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M12 12a5 5 0 100-10 5 5 0 000 10z" />
  </svg>
);
const MoonIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);
const LanguageIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);
const LogoutIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

export default function Sidebar({ isOpen, onClose }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const user = authService.getUserFromToken();
  const { theme, toggleTheme } = useTheme();
  const { cartCount } = useCart();
  const [language, setLanguage] = useState(i18n.language);

  const isActive = (path) => {
    if (path === '/reports' && (location.pathname.startsWith('/reports'))) return true;
    return location.pathname === path;
  };

  const handleLanguageChange = (e) => {
    const selectedLang = e.target.value;
    setLanguage(selectedLang);
    localStorage.setItem("sr_lang", selectedLang);
    i18n.changeLanguage(selectedLang);
  };

  const logout = () => {
    authService.logout();
    window.location.href = '/login';
  };

  if (!user) return null;

  return (
    <>
      {/* Mobile overlay */}
      <div 
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
      />
      
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <LogoIcon />
          </div>
          <span className="sidebar-brand">Smart Retail</span>
        </div>

        <nav className="sidebar-nav custom-scrollbar">
          <div className="sidebar-section-label">Main Menu</div>
          <Link to="/dashboard" className={`sidebar-link ${isActive('/dashboard') ? 'active' : ''}`} onClick={onClose}>
            <DashboardIcon /> <span>{t('nav.dashboard')}</span>
          </Link>
          <Link to="/products" className={`sidebar-link ${isActive('/products') ? 'active' : ''}`} onClick={onClose}>
            <ProductsIcon /> <span>{t('nav.products')}</span>
            <span className="sidebar-badge">2</span> {/* Mock Low Stock Alert */}
          </Link>
          <Link to="/checkout" className={`sidebar-link ${isActive('/checkout') ? 'active' : ''}`} onClick={onClose}>
            <PosIcon /> <span>POS / Billing</span>
            {cartCount > 0 && <span className="sidebar-badge" style={{ background: 'var(--primary)' }}>{cartCount}</span>}
          </Link>

          <div className="sidebar-section-label">Inventory & Tools</div>
          <Link to="/scan" className={`sidebar-link ${isActive('/scan') ? 'active' : ''}`} onClick={onClose}>
            <ScanIcon /> <span>Scan Barcode</span>
          </Link>
          <Link to="/bills" className={`sidebar-link ${isActive('/bills') ? 'active' : ''}`} onClick={onClose}>
            <BillsIcon /> <span>{t('nav.bills')}</span>
          </Link>
          
          <div className="sidebar-section-label">Management</div>
          <Link to="/customers" className={`sidebar-link ${isActive('/customers') ? 'active' : ''}`} onClick={onClose}>
            <CustomersIcon /> <span>{t('nav.customers')}</span>
          </Link>
          <Link to="/reports" className={`sidebar-link ${isActive('/reports') ? 'active' : ''}`} onClick={onClose}>
            <ReportsIcon /> <span>{t('nav.reports')}</span>
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="flex items-center justify-between px-2 mb-2">
            <button onClick={toggleTheme} className="btn-icon" title="Toggle Theme">
              {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
            <div className="relative flex items-center">
              <LanguageIcon />
              <select
                value={language}
                onChange={handleLanguageChange}
                className="bg-transparent text-sm ml-1 border-0 focus:ring-0 outline-none cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                <option value="en">{t('lang.en')}</option>
                <option value="hi">{t('lang.hi')}</option>
                <option value="mr">{t('lang.mr')}</option>
                <option value="te">{t('lang.te')}</option>
              </select>
            </div>
            <button onClick={logout} className="btn-icon text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Logout">
              <LogoutIcon />
            </button>
          </div>
          
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user.email}</div>
              <div className="sidebar-user-role">Store Admin</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
