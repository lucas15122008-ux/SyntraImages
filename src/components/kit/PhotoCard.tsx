'use client';

import { TYPE_LABELS } from '@/lib/kit/labels';
import type { PhotoType } from '@/lib/kit/types';

export type ReviewPhoto = {
  position: number;
  kind: 'cover' | 'generated' | 'fixed';
  type: PhotoType | null;
  status: 'pending' | 'generating' | 'done' | 'failed';
  /** URL assinada da foto pronta (gerada ou fixa). */
  url: string | null;
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
  const generating = busy || photo.status === 'generating';
  const failed = !generating && photo.status === 'failed';
  const shownError = error ?? (failed ? photo.error : null);
  const isFixed = photo.kind === 'fixed';
  const bad = photo.warn || failed || !!error;

  return (
    <div className="card" data-testid={`photo-${photo.position}`} data-status={generating ? 'generating' : photo.status}>
      <div className={`img${bad ? ' bad' : ''}`}>
        {photo.url && !generating ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage
          <img src={photo.url} alt={`Foto ${photo.position}`} />
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
                {generating ? 'IA' : failed ? 'falhou' : photo.status === 'pending' ? 'na fila' : photo.attempts > 1 ? `ok · ${photo.attempts}ª` : 'ok'}
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
