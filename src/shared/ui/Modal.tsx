import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { GlassCard } from './GlassCard';
import { popIn } from '../lib/motionPresets';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  title?: string;
  fullScreen?: boolean;
}

/**
 * Modal do app.
 *
 * A entrada e a saída ficam centralizadas aqui de propósito: todo overlay
 * que usa este componente (WeeklyReport, NotebookStudio, PersonaManager)
 * herda o mesmo movimento. Antes cada um retornava `null` na saída, então
 * o fechamento era um corte seco, sem transição.
 *
 * `AnimatePresence` é o que torna a saída possível: ele segura o elemento
 * no DOM até a animação terminar.
 */
export function Modal({ open, onClose, children, title, fullScreen }: ModalProps) {
  const reduzir = useReducedMotion();

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Esc fecha, como se espera de qualquer diálogo.
  useEffect(() => {
    if (!open || !onClose) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <m.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <m.div
            role="dialog"
            aria-modal="true"
            variants={reduzir ? undefined : popIn}
            initial={reduzir ? { opacity: 0 } : 'inicial'}
            animate={reduzir ? { opacity: 1 } : 'animar'}
            exit={reduzir ? { opacity: 0 } : 'sair'}
            className={`relative z-10 w-full ${
              fullScreen
                ? 'max-w-4xl h-dvh md:h-[90dvh]'
                : 'max-w-lg max-h-dvh md:max-h-[85dvh]'
            }`}
          >
            <GlassCard
              className={`overflow-y-auto ${fullScreen ? 'h-full' : 'max-h-dvh md:max-h-[85dvh]'}`}
              padding="none"
            >
              {title && (
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                  <h2 className="text-lg font-bold text-white">{title}</h2>
                  {onClose && (
                    <m.button
                      onClick={onClose}
                      aria-label="Fechar"
                      className="btn-ghost leading-none"
                      whileTap={reduzir ? undefined : { scale: 0.92 }}
                    >
                      <X size={18} />
                    </m.button>
                  )}
                </div>
              )}
              <div className="p-5">{children}</div>
            </GlassCard>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
