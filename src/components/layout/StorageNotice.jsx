import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount } from '../../context/InventoryContext';

/** Saving must never fail quietly: this stays on screen for as long as the device is not keeping the data. */
export default function StorageNotice() {
  const { t } = useTranslation();
  const { storage, saveError } = useAccount();
  const message = storage === 'memory' ? t('app.notSaving') : saveError ? t('app.saveFailed') : null;
  if (!message) return null;
  return (
    <div className="storage-notice no-print" role="alert">
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
      <p>{message}</p>
    </div>
  );
}
