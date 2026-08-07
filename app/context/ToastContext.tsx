import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  message: string;
  action?: ToastAction;
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastContextType {
  toast: ToastState | null;
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
}

// Long enough to comfortably read the message and tap Undo without rushing -- toasts can also be
// swiped away early (see ToastBanner) for anyone who doesn't need the full duration.
const DEFAULT_DURATION = 8000;

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextId = useRef(0);

  const hideToast = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const id = ++nextId.current;
    setToast({ id, ...options });
    timeoutRef.current = setTimeout(() => {
      // Guard against a newer toast (higher id) having already replaced this one before the
      // timer fired -- without this a stale timeout could hide a toast that isn't its own.
      setToast(current => (current?.id === id ? null : current));
    }, options.duration ?? DEFAULT_DURATION);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, showToast, hideToast }}>
      {children}
    </ToastContext.Provider>
  );
};
