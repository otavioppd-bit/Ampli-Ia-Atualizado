import { ReactNode, useEffect } from 'react';
import { GlassCard } from './GlassCard';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  title?: string;
  fullScreen?: boolean;
}

export function Modal({ open, onClose, children, title, fullScreen }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={`relative z-10 animate-scale-in ${
          fullScreen
            ? 'w-full max-w-4xl h-[90dvh]'
            : 'w-full max-w-lg max-h-[85dvh]'
        }`}
      >
        <GlassCard className={`overflow-y-auto ${fullScreen ? 'h-full' : 'max-h-[85dvh]'}`} padding="none">
          {title && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">{title}</h2>
              {onClose && (
                <button onClick={onClose} className="btn-ghost text-lg leading-none">
                  ✕
                </button>
              )}
            </div>
          )}
          <div className={title ? 'p-5' : 'p-5'}>{children}</div>
        </GlassCard>
      </div>
    </div>
  );
}
