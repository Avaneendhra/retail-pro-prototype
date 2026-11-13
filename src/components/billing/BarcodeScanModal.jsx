import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';
import Modal from '../common/Modal';

/** Continuous barcode scanner. Calls onCode once per distinct scan (1.5s debounce). */
export default function BarcodeScanModal({ open, onClose, onCode }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const scannerRef = useRef(null);
  const lastRef = useRef({ code: '', at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError('');
    const start = async () => {
      try {
        const scanner = new Html5Qrcode('bill-scan-reader');
        scannerRef.current = scanner;
        await scanner.start({ facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 160 }, experimentalFeatures: { useBarCodeDetectorIfSupported: true } },
          (text) => {
            const now = Date.now();
            if (text === lastRef.current.code && now - lastRef.current.at < 1500) return;
            lastRef.current = { code: text, at: now };
            onCodeRef.current?.(text);
          }, () => {});
        if (cancelled) scanner.stop().catch(() => {});
      } catch {
        if (!cancelled) setError(t('addStock.errCamera'));
      }
    };
    const id = setTimeout(start, 50); // wait for the reader element
    return () => {
      cancelled = true;
      clearTimeout(id);
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) s.stop().catch(() => {});
    };
  }, [open, t]);

  return (
    <Modal open={open} onClose={onClose} title={t('billing.scan')} width={480}
      footer={<button className="btn btn-secondary" onClick={onClose}>{t('common.close')}</button>}>
      <div id="bill-scan-reader" className="rounded-2xl overflow-hidden bg-black min-h-[240px]" />
      {error && <p className="text-sm text-[var(--danger)] mt-3">{error}</p>}
    </Modal>
  );
}
