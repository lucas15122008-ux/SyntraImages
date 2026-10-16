'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { Icon } from '@/components/ui/Icon';
import { labelOf, type ReviewPhoto } from './PhotoCard';

type Props = {
  photo: ReviewPhoto | null;
  originalUrl: string;
  busy: boolean;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onRedo: () => void;
};

/**
 * Conferência de fidelidade: a foto gerada ao lado da original, grandes.
 * Setas do teclado trocam de foto; Esc fecha e devolve o foco ao cartão.
 */
export function CompareLightbox({ photo, originalUrl, busy, onClose, onPrev, onNext, onRedo }: Props) {
  const reduced = usePrefersReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = !!photo;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onPrev, onNext]);

  const isFixed = photo?.kind === 'fixed';

  return (
    <AnimatePresence>
      {photo && (
        <motion.div className="lightbox" role="dialog" aria-modal="true" aria-label={`Foto ${photo.position}: comparar com a original`} initial="hidden" animate="visible" exit="hidden">
          <motion.div
            className="lightbox-scrim"
            onClick={onClose}
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: reduced ? 0.1 : 0.25 }}
          />
          <motion.div
            className="lightbox-panel"
            variants={
              reduced
                ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
                : { hidden: { opacity: 0, y: 24, scale: 0.96, filter: 'blur(6px)' }, visible: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' } }
            }
            transition={{ duration: reduced ? 0.1 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="lightbox-head">
              <h2>
                <span className="pos" style={{ font: '500 13px var(--mono)', color: 'var(--muted)', marginRight: 8 }}>
                  {String(photo.position).padStart(2, '0')}
                </span>
                {labelOf(photo)}
              </h2>
              <button ref={closeRef} type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}>
                <Icon name="x" />
              </button>
            </div>
            {photo.warn && (
              <p className="alert">
                <Icon name="alert" size={16} /> Este ângulo pode não aparecer na foto original. Confira se a peça é a mesma.
              </p>
            )}
            <div className="compare">
              <figure>
                <motion.div key={photo.version ?? photo.position} className="frame" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage */}
                  {photo.url ? <img src={photo.url} alt={`Foto ${photo.position} ampliada`} /> : <span>Sem imagem</span>}
                </motion.div>
                <figcaption>
                  <Icon name="sparkles" size={14} /> {isFixed ? 'Arte fixa da loja' : 'Gerada pela IA'}
                </figcaption>
              </figure>
              {!isFixed && (
                <figure>
                  <div className="frame">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage */}
                    <img src={originalUrl} alt="Foto original ampliada" />
                  </div>
                  <figcaption>
                    <Icon name="image" size={14} /> Foto original do produto
                  </figcaption>
                </figure>
              )}
            </div>
            <div className="lightbox-foot">
              <div className="lightbox-nav">
                <button type="button" className="icon-btn" aria-label="Foto anterior" disabled={!onPrev} onClick={onPrev ?? undefined}>
                  <Icon name="chevronLeft" />
                </button>
                <button type="button" className="icon-btn" aria-label="Próxima foto" disabled={!onNext} onClick={onNext ?? undefined}>
                  <Icon name="chevronRight" />
                </button>
              </div>
              {!isFixed && (
                <button type="button" className="btn" disabled={busy} onClick={onRedo}>
                  <Icon name="redo" size={16} />
                  {busy ? 'Refazendo…' : 'Refazer esta foto'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
