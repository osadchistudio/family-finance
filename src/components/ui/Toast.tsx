'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, X, Sparkles } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'learning';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  learning: Sparkles,
};

const styles = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  learning: 'bg-purple-50 border-purple-200 text-purple-800',
};

const iconStyles = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  learning: 'text-purple-500',
};

export function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const Icon = icons[type];

  return (
    <div
      className={`
        fixed bottom-4 left-4 z-50
        flex items-center gap-3 px-4 py-3
        border rounded-lg shadow-lg
        transform transition-all duration-300
        ${styles[type]}
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}
      `}
    >
      <Icon className={`h-5 w-5 ${iconStyles[type]}`} />
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="mr-2 p-1 hover:bg-black/10 rounded"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// Toast container and hook
interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const toastStore = {
  listeners: [] as ((toasts: ToastItem[]) => void)[],
  toasts: [] as ToastItem[],
};

function notifyToastListeners() {
  const snapshot = [...toastStore.toasts];
  toastStore.listeners.forEach((listener) => listener(snapshot));
}

export function showToast(message: string, type: ToastType = 'info') {
  const id = Math.random().toString(36).slice(2, 11);
  toastStore.toasts.push({ id, message, type });
  notifyToastListeners();
}

export function ToastContainer() {
  const [localToasts, setLocalToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setLocalToasts(newToasts);
    toastStore.listeners.push(listener);

    return () => {
      const index = toastStore.listeners.indexOf(listener);
      if (index >= 0) {
        toastStore.listeners.splice(index, 1);
      }
    };
  }, []);

  const removeToast = (id: string) => {
    const index = toastStore.toasts.findIndex((toast) => toast.id === id);
    if (index < 0) return;
    toastStore.toasts.splice(index, 1);
    notifyToastListeners();
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      {localToasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
