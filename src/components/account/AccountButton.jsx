import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount } from '../../context/InventoryContext';
import AccountModal from './AccountModal';
import { syncLabel } from './syncLabel';

const tone = (sync) => (sync.status === 'idle' && !sync.pending ? 'is-online' : sync.status === 'syncing' ? '' : 'is-offline');

/** Top-bar button: "Sign in" without an account, the sync state with one. Opens the account window. */
export default function AccountButton() {
  const { t } = useTranslation();
  const { mode, sync } = useAccount();
  const [open, setOpen] = useState(false);
  return (
    <>
      {mode === 'account' ? (
        <button className={`status-pill account-pill ${tone(sync)}`} onClick={() => setOpen(true)} title={t('account.title')}>
          <span className="dot" />{syncLabel(t, sync)}
        </button>
      ) : (
        <button className="btn btn-primary btn-sm account-pill" onClick={() => setOpen(true)}>{t('account.signIn')}</button>
      )}
      <AccountModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
