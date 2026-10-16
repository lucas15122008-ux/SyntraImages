'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { useMotionPresets } from '@/components/motion/presets';
import { TYPE_LABELS } from '@/lib/kit/labels';
import type { PhotoType } from '@/lib/kit/types';

export type ReviewPhoto = {
  position: number;
  kind: 'cover' | 'generated' | 'fixed';
  type: PhotoType | null;
  status: 'pending' | 'generating' | 'done' | 'failed';
  /** URL assinada da imagem atual (gerada ou fixa); muda a cada refresh da página. */
  url: string | null;
  /** Identifica o arquivo da imagem (caminho no storage); só muda quando a foto é refeita. */
  version: string | null;
  /** Ficou em "generating" por mais de 5 minutos: o servidor provavelmente caiu. */
  stale: boolean;
  /** Aviso de ângulo ausente ligado (e não dispensado). */
  warn: boolean;
  error: string | null;
  attempts: number;
};

type Props = {
  photo: ReviewPhoto;
  originalUrl: string;
  busy: boolean;
  error: string | null;
  onRedo: () => void;
  onToggleWarning: () => void;
};

function labelOf(p: ReviewPhoto): string {
  if (p.kind === 'cover') return 'Capa';
  if (p.kind === 'fixed') return 'Loja';
  return p.type ? TYPE_LABELS[p.type] : 'Foto';
}

export function PhotoCard({ photo, originalUrl, busy, error, onRedo, onToggleWarning }: Props) {
  const { photoArrive } = useMotionPresets();
  // Mantém a URL do primeiro render de cada arquivo: refreshes geram URLs novas para a mesma imagem.
  const [shown, setShown] = useState({ version: photo.version, url: photo.url });
  if (shown.version !== photo.version || (!shown.url && photo.url)) setShown({ version: photo.version, url: photo.url });

  const stuck = !busy && photo.status === 'generating' && photo.stale;
  const generating = busy || (photo.status === 'generating' && !photo.stale);
  const failed = !generating && photo.status === 'failed';
  const shownError = error ?? (failed ? photo.error : null);
  const isFixed = photo.kind === 'fixed';
  const bad = photo.warn || failed || stuck || !!error;

  return (
    <div className="card" data-testid={`photo-${photo.position}`} data-status={generating ? 'generating' : photo.status}>
      <div className={`img${bad ? ' bad' : ''}`}>
        {shown.url && !generating ? (
          <motion.img key={shown.version ?? shown.url} src={shown.url} alt={`Foto ${photo.position}`} variants={photoArrive} initial="hidden" animate="visible" />
        ) : generating ? (
          <span className="spinner-label" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            Gerando…
          </span>
        ) : photo.status === 'pending' ? (
          <span>Na fila</span>
        ) : (
          <span>Sem imagem</span>
        )}
        {!isFixed && (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage
          <img className="original-thumb" src={originalUrl} alt="Foto original" />
        )}
      </div>
      <div className="info">
        <strong>
          {photo.position} · {labelOf(photo)}
        </strong>
        {photo.warn && <span className="pill warn">pode não mostrar este ângulo</span>}
        {stuck && (
          <p className="field-error" role="alert">
            A geração travou (o servidor pode ter caído). Clique em Refazer.
          </p>
        )}
        {shownError && (
          <p className="field-error" role="alert">
            {shownError}
          </p>
        )}
        <div className="top">
          {isFixed ? (
            <span className="pill free">fixa</span>
          ) : (
            <>
              <span className={`pill${photo.status === 'done' && !failed ? '' : ' gen'}`}>
                {generating ? 'IA' : stuck ? 'travou' : failed ? 'falhou' : photo.status === 'pending' ? 'na fila' : photo.attempts > 1 ? `ok · ${photo.attempts}ª` : 'ok'}
              </span>
              <button type="button" className="btn ghost" disabled={generating} onClick={onRedo}>
                {busy ? 'Refazendo…' : 'Refazer'}
              </button>
            </>
          )}
        </div>
        {!isFixed && (
          <button type="button" className="link-btn" onClick={onToggleWarning}>
            {photo.warn ? 'Tirar aviso' : 'Marcar aviso'}
          </button>
        )}
      </div>
    </div>
  );
}
