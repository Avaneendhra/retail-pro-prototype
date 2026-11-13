import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import { useSettings } from '../../lib/settings';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';

export default function SettingsModal({ open, onClose }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useSettings();
  const { resetDemo } = useInventory();
  const { showToast } = useToast();
  const [key, setKey] = useState('');
  const [shop, setShop] = useState(settings.shopName);
  const hasKey = !!settings.apiKey;

  const saveKey = () => {
    if (!key.trim()) return;
    setSettings({ apiKey: key.trim() });
    setKey('');
    showToast(t('settings.keySaved'), 'success');
  };

  return (
    <Modal open={open} onClose={onClose} title={t('settings.title')}
      footer={<button className="btn btn-cta" onClick={() => { setSettings({ shopName: shop.trim() || 'Smart Retail' }); onClose(); }}>{t('common.save')}</button>}>
      <div className="space-y-7">
        <section>
          <label className="field-label" htmlFor="shop-name">{t('settings.shop')}</label>
          <input id="shop-name" className="form-input" value={shop} onChange={e => setShop(e.target.value)} />
        </section>

        <section>
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="font-semibold">{t('settings.aiTitle')}</h3>
            <span className={`badge ${hasKey ? 'badge-success' : 'badge-info'}`}>{hasKey ? t('settings.usingClaude') : t('settings.usingOcr')}</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">{t('settings.aiBody')}</p>
          {hasKey ? (
            <div className="flex items-center justify-between gap-3 card-inset px-4 py-3">
              <span className="font-mono text-sm">{settings.apiKey.slice(0, 10)}••••••{settings.apiKey.slice(-4)}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSettings({ apiKey: '' }); showToast(t('settings.keyRemoved'), 'success'); }}>{t('settings.removeKey')}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="password" autoComplete="off" className="form-input font-mono" placeholder={t('settings.apiKeyPlaceholder')}
                aria-label={t('settings.apiKey')} value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveKey()} />
              <button className="btn btn-primary" onClick={saveKey} disabled={!key.trim()}>{t('common.save')}</button>
            </div>
          )}
        </section>

        <section>
          <h3 className="font-semibold mb-2">{t('settings.dataTitle')}</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => {
            if (window.confirm(t('settings.resetConfirm'))) { resetDemo(); showToast(t('settings.resetDone'), 'success'); onClose(); }
          }}>{t('settings.reset')}</button>
        </section>
      </div>
    </Modal>
  );
}
