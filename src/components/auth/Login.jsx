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
const LogoIcon = () => (
  <svg className="w-20 h-20 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
);
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.223 0-9.64-3.518-11.28-8.294l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.012 36.49 44 30.823 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </svg>
);
// --- End Icons ---

export default function Login() {
  const { t } = useTranslation(); // <-- 2. Get hook
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    try {
      const data = await authService.login({ email, password });
      if (!data || !data.accessToken) {
        throw new Error('No access token received from backend.');
      }
      nav('/dashboard');
    } catch (e) {
      console.error('Login error:', e);
      setErr(e.response?.data?.error || e.response?.data?.message || e.message || "An unknown error occurred.");
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
          {t('auth.brandPanelLogin')}
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
            {t('auth.signIn')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-center lg:text-left">
            {t('auth.signInWelcome')}
          </p>

          {err && (
            <div className="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-100 px-4 py-3 rounded-lg mb-6" role="alert">
              <span className="font-medium">{t('auth.loginFailed')}</span> {err}
            </div>
          )}

          <form onSubmit={submit} className="space-y-6">
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
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('auth.password')}
                </label>
                <a href="#" className="text-sm text-blue-500 dark:text-blue-400 hover:underline">
                  {t('auth.forgotPassword')}
                </a>
              </div>
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

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-md font-semibold
                         transition-all duration-300 ease-in-out
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-900"
            >
              {t('auth.signIn')}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-900 text-gray-500">
                {t('auth.or')}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <a
              href="http://localhost:8080/oauth2/authorization/google"
              className="social-button"
            >
              <GoogleIcon />
              <span>{t('auth.continueWithGoogle')}</span>
            </a>
          </div>

          <p className="text-sm mt-8 text-center text-gray-600 dark:text-gray-400">
            {t('auth.noAccount')}{' '}
            <a href="/signup" className="font-medium text-blue-500 dark:text-blue-400 hover:underline">
              {t('auth.signUpHere')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}