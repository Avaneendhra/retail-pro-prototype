import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstall } from '../../lib/install';
import { LogoMark } from './Logo';

const KEY = 'sr2_install_dismissed';

/** "Install stokd on your phone" banner (Android prompt, or iOS Share-sheet hint). */
export default function InstallBanner() {
  const { t } = useTranslation();
  const { canPrompt, iosHint, install } = useInstall();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  if (hidden || (!canPrompt && !iosHint)) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } };
  return (
    <div className="install-banner animate-in" role="region" aria-label={t('install.title')}>
      <LogoMark size={40} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('install.title')}</p>
        <p className="text-sm text-[var(--text-secondary)]">{canPrompt ? t('install.body') : t('install.ios')}</p>
      </div>
      {canPrompt && <button className="btn btn-cta btn-sm" onClick={install}>{t('install.button')}</button>}
      <button className="btn-icon" onClick={dismiss} aria-label={t('common.close')}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}
