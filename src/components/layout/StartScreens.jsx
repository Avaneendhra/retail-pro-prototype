import React from 'react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';

/** Shown for the moment it takes to read the shop's data from the device. */
export function Splash() {
  const { t } = useTranslation();
  return (
    <div className="start-screen" role="status" aria-live="polite">
      <Logo />
      <span className="start-spinner" aria-hidden="true" />
      <p>{t('app.loading')}</p>
    </div>
  );
}

function Stopped({ title, body, detail }) {
  const { t } = useTranslation();
  return (
    <div className="start-screen">
      <Logo />
      <div className="card p-8 max-w-md text-center">
        <h1 className="font-display text-[24px] font-bold tracking-tight">{title}</h1>
        <p className="text-[var(--text-secondary)] mt-3 leading-relaxed">{body}</p>
        {detail && <p className="text-xs font-mono text-[var(--text-muted)] mt-3 break-words">{detail}</p>}
        <button className="btn btn-cta mt-6" onClick={() => window.location.reload()}>{t('app.tryAgain')}</button>
      </div>
    </div>
  );
}

/** Two tabs would each save their own copy over the other's, so only one runs. */
export function AlreadyOpen() {
  const { t } = useTranslation();
  return <Stopped title={t('app.alreadyOpenTitle')} body={t('app.alreadyOpenBody')} />;
}

export function StartError({ error }) {
  const { t } = useTranslation();
  return <Stopped title={t('app.startErrorTitle')} body={t('app.startErrorBody')} detail={String(error?.message || error || '')} />;
}
