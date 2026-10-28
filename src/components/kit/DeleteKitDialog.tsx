'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { Icon } from '@/components/ui/Icon';

const noop = () => () => {};

type Props = {
  open: boolean;
  name: string;
  thumbUrl: string | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Confirmação de exclusão no padrão do lightbox: vidro sobre a tela, capa do kit e lixeira
 * que abre a tampa quando o botão de excluir é apontado. O foco começa em "Cancelar" (o caminho
 * seguro); Esc e clique fora cancelam, a não ser durante a exclusão.
 */
export function DeleteKitDialog({ open, name, thumbUrl, busy, error, onCancel, onConfirm }: Props) {
  const reduced = usePrefersReducedMotion();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  // Só no navegador existe document.body para o portal.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      setArmed(false);
      previous?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Mantém o Tab dentro do pop-up.
      const items = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)')];
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
  }, [open, busy, onCancel]);

  if (!mounted) return null;
  const arm = { onMouseEnter: () => setArmed(true), onMouseLeave: () => setArmed(false), onFocus: () => setArmed(true), onBlur: () => setArmed(false) };

  // Portal: o cartão da galeria tem transform, que prenderia o `position: fixed` dentro dele.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc" initial="hidden" animate="visible" exit="hidden">
          <motion.div
            className="lightbox-scrim"
            onClick={busy ? undefined : onCancel}
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: reduced ? 0.1 : 0.25 }}
          />
          <motion.div
            ref={panelRef}
            className="confirm-panel"
            data-armed={armed || busy || undefined}
            data-busy={busy || undefined}
            variants={
              reduced
                ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
                : { hidden: { opacity: 0, y: 24, scale: 0.94, filter: 'blur(6px)' }, visible: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' } }
            }
            transition={{ duration: reduced ? 0.1 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="confirm-visual" aria-hidden="true">
              <div className="confirm-art">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage */}
                {thumbUrl ? <img src={thumbUrl} alt="" /> : <Icon name="image" size={32} />}
              </div>
              <span className="confirm-badge">
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                  <path className="lid" d="M4 7h16M9 7V4h6v3" />
                  <path d="M6 7l1 13h10l1-13M10 11v5M14 11v5" />
                </svg>
              </span>
            </div>

            <div className="confirm-text">
              <h2 id="confirm-title">Excluir este kit?</h2>
              <p className="confirm-name" title={name}>{name}</p>
            </div>

            <ul id="confirm-desc" className="confirm-facts">
              <li>
                <Icon name="image" size={16} />
                <span>A foto original e as fotos geradas serão apagadas.</span>
              </li>
              <li>
                <Icon name="store" size={16} />
                <span>As artes da loja continuam salvas para os outros kits.</span>
              </li>
              <li className="danger">
                <Icon name="alert" size={16} />
                <span>Não dá para desfazer.</span>
              </li>
            </ul>

            <AnimatePresence initial={false}>
              {error && (
                <motion.p
                  className="alert confirm-error"
                  role="alert"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Icon name="alert" size={16} /> {error}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="confirm-actions">
              <button ref={cancelRef} type="button" className="btn soft" onClick={onCancel} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn danger" onClick={onConfirm} disabled={busy} {...arm}>
                {busy ? <span className="btn-spinner" aria-hidden="true" /> : <Icon name="trash" size={16} />}
                {busy ? 'Excluindo…' : 'Excluir kit'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
