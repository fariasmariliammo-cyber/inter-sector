import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warning';

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextType = {
  showToast: (variant: ToastVariant, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TOAST_TIMEOUT_MS = 4500;

function toastStyles(variant: ToastVariant): string {
  if (variant === 'success') {
    return 'border-emerald-700/80 bg-emerald-100 text-emerald-950 dark:border-emerald-400/70 dark:bg-emerald-950 dark:text-emerald-100';
  }

  if (variant === 'error') {
    return 'border-red-700/80 bg-red-100 text-red-950 dark:border-red-400/70 dark:bg-red-950 dark:text-red-100';
  }

  return 'border-amber-700/80 bg-amber-100 text-amber-950 dark:border-amber-400/70 dark:bg-amber-950 dark:text-amber-100';
}

function toastIcon(variant: ToastVariant) {
  if (variant === 'success') {
    return <CheckCircle2 size={18} className="text-emerald-800 dark:text-emerald-200" />;
  }

  if (variant === 'error') {
    return <AlertCircle size={18} className="text-red-800 dark:text-red-200" />;
  }

  return <AlertTriangle size={18} className="text-amber-800 dark:text-amber-200" />;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((variant: ToastVariant, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);

    setToasts((prev) => [...prev, { id, message, variant }]);

    window.setTimeout(() => {
      dismissToast(id);
    }, TOAST_TIMEOUT_MS);
  }, [dismissToast]);

  const contextValue = useMemo<ToastContextType>(() => ({
    showToast,
    success: (message: string) => showToast('success', message),
    error: (message: string) => showToast('error', message),
    warning: (message: string) => showToast('warning', message),
  }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex w-[92vw] max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className={`rounded-xl border p-3 shadow-2xl backdrop-blur ${toastStyles(toast.variant)}`}
            >
              <div className="flex items-start gap-3">
                <div className="pt-0.5">{toastIcon(toast.variant)}</div>
                <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded-md p-1 text-current/85 transition-colors hover:bg-black/10 hover:text-current dark:hover:bg-white/10"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
