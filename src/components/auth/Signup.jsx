import React, { useState } from 'react';
import authService from '../../services/authService';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // <-- 1. Import

// --- Icons (No changes) ---
const MailIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206" />
  </svg>
);
const LockIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);
const UserIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);
const SelectArrowIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);
const LogoIcon = () => (
  <svg className="w-20 h-20 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
);
// --- End Icons ---

export default function Signup() {
  const { t } = useTranslation(); // <-- 2. Get hook
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('CASHIER');
  const [error, setError] = useState(null);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      await authService.signup({ name, email, password, role });
      alert('Signup successful! Please log in.'); // You could translate this too!
      nav('/login');
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Signup failed');
    }
  }

  return (
    <div className="min-h-screen flex text-gray-800 dark:text-gray-200">

      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center bg-gray-100 dark:bg-gray-900 p-12 text-center shadow-2xl z-10">
        <LogoIcon />
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mt-6">
          {t('auth.brandPanelTitle')}
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mt-4 max-w-sm">
          {t('auth.brandPanelSignup')}
        </p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8
                      bg-white dark:bg-gradient-to-br dark:from-gray-800 dark:via-gray-900 dark:to-black
                      dark:animate-gradient-xy dark:bg-[length:300%_300%]">

        <div className="w-full max-w-md">
          <div className="lg:hidden flex flex-col items-center text-center mb-8">
            <LogoIcon />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-4">{t('auth.brandPanelTitle')}</h2>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center lg:text-left">
            {t('auth.signUp')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-center lg:text-left">
            {t('auth.signUpWelcome')}
          </p>

          {error && (
            <div className="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded-lg mb-6" role="alert">
              <span className="font-medium">{t('auth.signupFailed')}</span> {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-6">

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('auth.fullName')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <UserIcon />
                </div>
                <input
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('auth.namePlaceholder')}
                  type="text"
                  required
                  className="form-input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('auth.emailAddress')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <MailIcon />
                </div>
                <input
                  id="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  type="email"
                  required
                  className="form-input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <LockIcon />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="form-input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('auth.role')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                  <UserIcon />
                </div>
                <select
                  id="role"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="form-input appearance-none"
                >
                  <option value="CASHIER">{t('auth.roleCashier')}</option>
                  <option value="MANAGER">{t('auth.roleManager')}</option>
                  <option value="OWNER">{t('auth.roleOwner')}</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SelectArrowIcon />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-md font-semibold
                         transition-all duration-300 ease-in-out
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-900"
            >
              {t('auth.createAccount')}
            </button>
          </form>

          <p className="text-sm mt-8 text-center text-gray-600 dark:text-gray-400">
            {t('auth.haveAccount')}{' '}
            <a href="/login" className="font-medium text-blue-500 dark:text-blue-400 hover:underline">
              {t('auth.signInHere')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}