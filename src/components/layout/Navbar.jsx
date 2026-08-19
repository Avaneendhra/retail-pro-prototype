import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
// --- END ICONS ---


export default function Navbar() {
  const { t } = useTranslation(); // <-- 3. Get translation function
  const nav = useNavigate();
  const user = authService.getUserFromToken();
  const { cartCount } = useCart();
  const { theme, toggleTheme } = useTheme();

  // 4. Use i18n's language state, which reads from localStorage
  const [language, setLanguage] = useState(i18n.language);

  const handleLanguageChange = (e) => {
    const selectedLang = e.target.value;
    setLanguage(selectedLang);
    localStorage.setItem("sr_lang", selectedLang);
    i18n.changeLanguage(selectedLang); // <-- 5. Change language live
    // window.location.reload(); // <-- 6. No longer needed!
  };

  const logout = () => {
    authService.logout();
    window.location.href = '/login';
  };

  return (
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
                {/* --- 7. Use t() function --- */}
                <Link to="/dashboard" className="nav-link">{t('nav.dashboard')}</Link>
                <Link to="/products" className="nav-link">{t('nav.products')}</Link>
                <Link to="/bills" className="nav-link">{t('nav.bills')}</Link>
                <Link to="/customers" className="nav-link">{t('nav.customers')}</Link>
                <Link to="/reports" className="nav-link">{t('nav.reports')}</Link>
              </div>
            )}
          </div>

          {/* Right section */}
          {user ? (
            <div className="flex gap-4 items-center">
              <Link to="/profile" className="nav-link text-blue-500 dark:text-blue-400 font-medium">
                {user.email}
              </Link>

              {/* Language Selector */}
              <div className="relative flex items-center">
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

              <Link
                to="/checkout"
                className="nav-link relative p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                title={t('nav.viewCart')}
              >
                <CartIcon count={cartCount} />
              </Link>

              <button
                onClick={logout}
                className="bg-red-600 px-3 py-1.5 rounded-md text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                {t('nav.logout')}
              </button>
            </div>
          ) : (
             <Link to="/login" className="bg-blue-600 px-3 py-1.5 rounded-md text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}