import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastEntry {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Shows a dismissible, auto-expiring notification instead of a blocking `alert()`. */
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Errors stay up longer since they're more likely to need reading twice.
const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
  success: 3500,
  info: 4000,
  error: 6000,
};

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100',
  error: 'bg-red-950/95 border-red-500/40 text-red-100',
  info: 'bg-[#0b121e]/95 border-white/10 text-slate-100',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant }]);
    window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS[variant]);
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
            className={`animate-slide-down pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-glass text-sm font-medium ${VARIANT_STYLES[toast.variant]}`}
          >
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="opacity-60 hover:opacity-100 transition-opacity leading-none text-lg"
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider.');
  return ctx;
}
