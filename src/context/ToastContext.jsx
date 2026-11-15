import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export const useToast = () => useContext(ToastContext);

const VISIBLE_MS = 3000;

const SuccessIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const ErrorIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v5m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const showToast = useCallback((message, type = 'success') => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), VISIBLE_MS);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map(toast => (
          <div key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'} className={`toast toast-${toast.type === 'error' ? 'error' : 'success'}`}>
            {toast.type === 'error' ? <ErrorIcon /> : <SuccessIcon />}
            <p>{toast.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
