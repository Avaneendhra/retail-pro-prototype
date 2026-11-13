import React, { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal-panel animate-in" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 className="font-display text-[22px] font-bold tracking-tight">{title}</h2>
          <button onClick={onClose} className="icon-pill !w-9 !h-9 shrink-0" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 mt-6">{footer}</div>}
      </div>
    </div>
  );
}
