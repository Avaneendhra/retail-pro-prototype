import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import authService from '../../services/authService';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next'; // <-- 1. Import
import i18n from '../../i18n'; // <-- 2. Import i18n instance

// --- Icons ---
const LogoIcon = () => (
  <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
);
const CartIcon = ({ count }) => (
  <div className="relative">
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
    {count > 0 && (
      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
        {count > 99 ? '99+' : count}
      </span>
    )}
  </div>
);
const LanguageIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);
const SunIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M12 12a5 5 0 100-10 5 5 0 000 10z" />
  </svg>
);
const MoonIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

// --- Bottom Nav Icons ---
const DashboardIcon = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
  </svg>
);
const ProductsIcon = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const ScanIcon = ({ active }) => (
  <svg className={`w-7 h-7 ${active ? 'text-white' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
  </svg>
);
const BillsIcon = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const CustomersIcon = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
// --- END ICONS ---


export default function Navbar() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const location = useLocation();
  const user = authService.getUserFromToken();
  const { cartCount } = useCart();
  const { theme, toggleTheme } = useTheme();

  const [language, setLanguage] = useState(i18n.language);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const isActive = (path) => location.pathname === path;

  // Bottom nav items
  const bottomNavItems = [
    { path: '/dashboard', label: 'Home', Icon: DashboardIcon },
    { path: '/products', label: 'Products', Icon: ProductsIcon },
    { path: '/scan', label: 'Scan', Icon: ScanIcon, isScan: true },
    { path: '/bills', label: 'Bills', Icon: BillsIcon },
    { path: '/customers', label: 'Customers', Icon: CustomersIcon },
  ];

  return (
    <>
      {/* === TOP NAVBAR === */}
      <nav className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-md border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Left section */}
            <div className="flex gap-6 items-center">
              <Link to="/" className="flex items-center gap-2 flex-shrink-0">
                <LogoIcon />
                <span className="font-semibold text-xl text-gray-900 dark:text-white">
                  Smart Retail
                </span>
              </Link>
              {user && (
                <div className="hidden md:flex gap-4">
                  <Link to="/dashboard" className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}>{t('nav.dashboard')}</Link>
                  <Link to="/products" className={`nav-link ${isActive('/products') ? 'active' : ''}`}>{t('nav.products')}</Link>
                  <Link to="/bills" className={`nav-link ${isActive('/bills') ? 'active' : ''}`}>{t('nav.bills')}</Link>
                  <Link to="/customers" className={`nav-link ${isActive('/customers') ? 'active' : ''}`}>{t('nav.customers')}</Link>
                  <Link to="/reports" className={`nav-link ${isActive('/reports') || isActive('/reports/summary') || isActive('/reports/text') ? 'active' : ''}`}>{t('nav.reports')}</Link>
                  <Link to="/scan" className={`nav-link ${isActive('/scan') ? 'active' : ''}`}>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      Scan
                    </span>
                  </Link>
                </div>
              )}
            </div>

            {/* Right section */}
            {user ? (
              <div className="flex gap-2 md:gap-4 items-center">
                {/* Profile - hidden on mobile */}
                <Link to="/profile" className="nav-link text-blue-500 dark:text-blue-400 font-medium hidden md:block">
                  {user.email}
                </Link>

                {/* Language Selector - hidden on small mobile */}
                <div className="relative flex items-center hidden sm:flex">
                  <LanguageIcon />
                  <select
                    value={language}
                    onChange={handleLanguageChange}
                    className="bg-transparent text-gray-600 dark:text-gray-300 font-medium text-sm rounded-md
                               pl-1 pr-7 -ml-1 py-1 border-0 focus:ring-0
                               hover:bg-gray-200 dark:hover:bg-gray-700/50 transition-colors"
                    aria-label={t('nav.selectLang')}
                  >
                    <option value="en" className="bg-white dark:bg-gray-800">{t('lang.en')}</option>
                    <option value="hi" className="bg-white dark:bg-gray-800">{t('lang.hi')}</option>
                    <option value="mr" className="bg-white dark:bg-gray-800">{t('lang.mr')}</option>
                    <option value="te" className="bg-white dark:bg-gray-800">{t('lang.te')}</option>
                  </select>
                </div>

                {/* Theme Toggle Button */}
                <button
                  onClick={toggleTheme}
                  className="nav-link p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                  {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                </button>

                {/* Cart */}
                <Link
                  to="/checkout"
                  className="nav-link relative p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                  title={t('nav.viewCart')}
                >
                  <CartIcon count={cartCount} />
                </Link>

                {/* Logout */}
                <button
                  onClick={logout}
                  className="bg-red-600 px-3 py-1.5 rounded-md text-sm font-medium text-white hover:bg-red-700 transition-colors hidden sm:block"
                >
                  {t('nav.logout')}
                </button>

                {/* Mobile menu button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {mobileMenuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            ) : (
               <Link to="/login" className="bg-blue-600 px-3 py-1.5 rounded-md text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                {t('nav.login')}
              </Link>
            )}
          </div>

          {/* Mobile dropdown menu */}
          {mobileMenuOpen && user && (
            <div className="md:hidden py-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
              <Link to="/profile" className="block nav-link" onClick={() => setMobileMenuOpen(false)}>
                👤 {user.email}
              </Link>
              <Link to="/reports" className="block nav-link" onClick={() => setMobileMenuOpen(false)}>
                📊 {t('nav.reports')}
              </Link>
              <div className="flex items-center gap-2 px-3 py-2">
                <LanguageIcon />
                <select
                  value={language}
                  onChange={(e) => { handleLanguageChange(e); setMobileMenuOpen(false); }}
                  className="bg-transparent text-gray-600 dark:text-gray-300 font-medium text-sm rounded-md
                             border-0 focus:ring-0"
                >
                  <option value="en">{t('lang.en')}</option>
                  <option value="hi">{t('lang.hi')}</option>
                  <option value="mr">{t('lang.mr')}</option>
                  <option value="te">{t('lang.te')}</option>
                </select>
              </div>
              <button
                onClick={() => { logout(); setMobileMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-red-500 font-medium rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                🚪 {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* === MOBILE BOTTOM NAVIGATION BAR === */}
      {user && (
        <div className="mobile-bottom-nav md:hidden">
          {bottomNavItems.map(({ path, label, Icon, isScan }) => (
            <Link
              key={path}
              to={path}
              className={`mobile-bottom-nav-item ${isScan ? 'scan-button-wrapper' : ''}`}
            >
              {isScan ? (
                <div className={`scan-button ${isActive(path) ? 'scan-button-active' : ''}`}>
                  <Icon active={isActive(path)} />
                </div>
              ) : (
                <>
                  <Icon active={isActive(path)} />
                  <span className={`mobile-bottom-nav-label ${isActive(path) ? 'text-blue-500 font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                    {label}
                  </span>
                  {isActive(path) && <div className="mobile-bottom-nav-indicator" />}
                </>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}