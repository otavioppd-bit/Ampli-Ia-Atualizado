import { useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';

export function Toast() {
  const { toastMessage, toastType, clearToast } = useAppStore();

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(clearToast, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, clearToast]);

  if (!toastMessage) return null;

  const styles = {
    success: 'bg-emerald-600/90 border-emerald-500/30 text-emerald-50',
    error: 'bg-red-600/90 border-red-500/30 text-red-50',
    info: 'bg-amber-600/90 border-amber-500/30 text-amber-50',
  };

  return (
    <div
      className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-5 py-3 rounded-2xl border shadow-lg backdrop-blur-xl font-medium text-sm animate-slide-up ${styles[toastType]}`}
    >
      {toastType === 'success' && '✓'}
      {toastType === 'error' && '✕'}
      {toastMessage}
    </div>
  );
}
