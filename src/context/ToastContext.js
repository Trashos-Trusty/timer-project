import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext({ addToast: () => {}, removeToast: () => {} });

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((toastId) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== toastId));
  }, []);

  const addToast = useCallback(({ type = 'info', title, message, duration = 4500 }) => {
    const id = Date.now();
    setToasts((prevToasts) => [...prevToasts, { id, type, title, message }]);

    if (duration) {
      setTimeout(() => removeToast(id), duration);
    }

    return id;
  }, [removeToast]);

  const value = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast]);

  const getToastStyles = (type) => {
    switch (type) {
      case 'error':
        return {
          container: 'bg-red-600 text-white shadow-lg shadow-red-200',
          badge: 'bg-white/20 text-white'
        };
      case 'success':
        return {
          container: 'bg-green-600 text-white shadow-lg shadow-green-200',
          badge: 'bg-white/20 text-white'
        };
      default:
        return {
          container: 'bg-gray-900 text-white shadow-lg shadow-gray-300',
          badge: 'bg-white/20 text-white'
        };
    }
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed inset-0 pointer-events-none flex flex-col items-end gap-3 p-4 z-[60]">
        {toasts.map((toast) => {
          const styles = getToastStyles(toast.type);
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 ${styles.container}`}
            >
              <div className="flex items-start space-x-3">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${styles.badge}`}>
                  !
                </span>
                <div className="flex-1 space-y-1">
                  {toast.title && <p className="font-semibold leading-tight">{toast.title}</p>}
                  {toast.message && <p className="text-sm leading-snug text-white/90">{toast.message}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
