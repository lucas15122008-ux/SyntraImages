'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { usePrefersReducedMotion } from '@/components/motion/presets';

const noop = () => () => {};
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)';

type Props = {
  open: boolean;
  /** Durante uma ação em andamento, Esc e clique fora não fecham. */
  busy?: boolean;
  onClose: () => void;
  /** Elemento que recebe o foco ao abrir. */
  initialFocus: RefObject<HTMLElement | null>;
  role?: 'dialog' | 'alertdialog';
  labelledBy: string;
  describedBy?: string;
  /** Atributos `data-*` do painel, para o CSS reagir ao estado (ex.: `data-armed`). */
  panelData?: Record<`data-${string}`, string | undefined>;
  wide?: boolean;
  children: ReactNode;
};

/**
 * Pop-up de vidro no padrão do lightbox: fundo desfocado, entrada do desfoque, foco preso
 * dentro e devolvido ao fechar. Base dos pop-ups de excluir, editar e refazer o kit.
 */
export function GlassDialog({ open, busy = false, onClose, initialFocus, role = 'dialog', labelledBy, describedBy, panelData, wide, children }: Props) {
  const reduced = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  // Só no navegador existe document.body para o portal.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    initialFocus.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, initialFocus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Mantém o Tab dentro do pop-up.
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!mounted) return null;

  // Portal: o cartão da galeria tem transform, que prenderia o `position: fixed` dentro dele.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="confirm" role={role} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} initial="hidden" animate="visible" exit="hidden">
          <motion.div
            className="lightbox-scrim"
            onClick={busy ? undefined : onClose}
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: reduced ? 0.1 : 0.25 }}
          />
          <motion.div
            ref={panelRef}
            className={`confirm-panel${wide ? ' wide' : ''}`}
            {...panelData}
            variants={
              reduced
                ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
                : { hidden: { opacity: 0, y: 24, scale: 0.94, filter: 'blur(6px)' }, visible: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' } }
            }
            transition={{ duration: reduced ? 0.1 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
