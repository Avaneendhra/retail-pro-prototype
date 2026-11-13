import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import { openCamera, closeCamera, scanVideoFrame, warmUpBarcodeEngine } from '../../lib/scanEngine';

/** Continuous barcode scanner for billing. Calls onCode once per distinct scan (1.5s debounce). */
export default function BarcodeScanModal({ open, onClose, onCode }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const lastRef = useRef({ code: '', at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!open) return;
    let stopped = false, cam = null, attempt = 0;
    setError('');
    warmUpBarcodeEngine();
    const loop = async () => {
      if (stopped) return;
      const hit = await scanVideoFrame(videoRef.current, attempt++).catch(() => null);
      if (hit && !stopped) {
        const now = Date.now();
        if (hit.text !== lastRef.current.code || now - lastRef.current.at > 1500) {
          lastRef.current = { code: hit.text, at: now };
          if (navigator.vibrate) navigator.vibrate(50);
          onCodeRef.current?.(hit.text);
        }
      }
      if (!stopped) setTimeout(loop, 90);
    };
    const id = setTimeout(async () => {
      try {
        cam = await openCamera(videoRef.current);
        if (stopped) { closeCamera(cam.stream); return; }
        loop();
      } catch {
        if (!stopped) setError(t('addStock.errCamera'));
      }
    }, 50);
    return () => { stopped = true; clearTimeout(id); closeCamera(cam?.stream); };
  }, [open, t]);

  return (
    <Modal open={open} onClose={onClose} title={t('billing.scan')} width={480}
      footer={<button className="btn btn-secondary" onClick={onClose}>{t('common.close')}</button>}>
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        {!error && <div className="scan-window" aria-hidden="true"><span /></div>}
      </div>
      {error && <p className="text-sm text-[var(--danger)] mt-3">{error}</p>}
    </Modal>
  );
}
