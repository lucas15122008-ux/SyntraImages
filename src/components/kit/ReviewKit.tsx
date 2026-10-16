'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { Icon } from '@/components/ui/Icon';
import { isReadyForDownload } from '@/lib/kit/download';
import { CompareLightbox } from './CompareLightbox';
import { PhotoCard, type ReviewPhoto } from './PhotoCard';

export type { ReviewPhoto } from './PhotoCard';

const CONCURRENCY = 3;
const POLL_MS = 5000;

type Props = {
  title: string;
  originalUrl: string;
  photos: ReviewPhoto[];
  /** Pede ao servidor para gerar (ou refazer) a foto da posição. */
  generate: (position: number) => Promise<{ status: string; error: string | null }>;
  setWarning: (position: number, on: boolean) => Promise<void>;
  /** Recarrega os dados do servidor (novas URLs assinadas e status). */
  refresh: () => void;
  downloadHref: string;
  /** Começa sozinho a gerar as fotos pendentes (padrão: sim). */
  autoStart?: boolean;
};

export function ReviewKit({ title, originalUrl, photos, generate, setWarning, refresh, downloadHref, autoStart = true }: Props) {
  const inFlightRef = useRef(new Set<number>());
  const [inFlight, setInFlight] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const started = useRef(false);
  const [openPos, setOpenPos] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();

  const run = useCallback(
    async (position: number) => {
      if (inFlightRef.current.has(position)) return; // uma geração por vez por foto
      inFlightRef.current.add(position);
      setInFlight(new Set(inFlightRef.current));
      setErrors((e) => ({ ...e, [position]: null }));
      try {
        const result = await generate(position);
        if (result.status === 'failed') setErrors((e) => ({ ...e, [position]: result.error ?? 'A geração falhou. Tente refazer.' }));
      } catch {
        setErrors((e) => ({ ...e, [position]: 'Não foi possível gerar esta foto agora. Tente refazer.' }));
      } finally {
        inFlightRef.current.delete(position);
        setInFlight(new Set(inFlightRef.current));
        refresh();
      }
    },
    [generate, refresh],
  );

  // Gera sozinho as fotos pendentes, no máximo 3 por vez.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    const queue = photos.filter((p) => p.kind !== 'fixed' && p.status === 'pending').map((p) => p.position);
    const worker = async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) await runRef.current(next);
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    // Só na primeira montagem: as fotos seguintes entram pelo botão Refazer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fotos que outra aba ou uma visita anterior deixou em geração: acompanha pelo servidor.
  const watching = photos.some((p) => p.status === 'generating' && !p.stale && !inFlight.has(p.position));
  useEffect(() => {
    if (!watching) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [watching, refresh]);

  const allDone = photos.every((p) => isReadyForDownload(p.status, !!p.url) && !inFlight.has(p.position));
  const warned = photos.filter((p) => p.warn);
  const ready = photos.filter((p) => isReadyForDownload(p.status, !!p.url) && !inFlight.has(p.position)).length;
  const working = photos.some((p) => inFlight.has(p.position) || (p.status === 'generating' && !p.stale) || (p.kind !== 'fixed' && p.status === 'pending'));

  // Só dá para abrir as fotos que já têm imagem.
  const viewable = photos.filter((p) => !!p.url && !inFlight.has(p.position));
  const openIndex = viewable.findIndex((p) => p.position === openPos);
  const opened = openIndex >= 0 ? viewable[openIndex] : null;
  const closeViewer = useCallback(() => setOpenPos(null), []);

  return (
    <div className="panel">
      <div className="review-top">
        <div className="head">
          <h2>{title}</h2>
          <span className="note">{photos.length} fotos. Refaça só as que não servem.</span>
        </div>
        <div className="progress-row">
          <span>
            <strong>{ready}</strong> de <strong>{photos.length}</strong> prontas
          </span>
          <span>{working ? 'Gerando com IA…' : allDone ? 'Kit completo' : 'Algumas fotos precisam ser refeitas'}</span>
        </div>
        <div className={`progress${working ? ' live' : ''}`} aria-hidden="true">
          <motion.span
            initial={false}
            animate={{ width: `${photos.length ? (ready / photos.length) * 100 : 0}%` }}
            transition={reduced ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>
      {warned.length > 0 && (
        <div className="alert" role="status">
          <Icon name="alert" size={16} />
          <span>
            {warned.map((p) => `Foto ${p.position}`).join(', ')}: pode não mostrar este ângulo na foto original. Confira antes de publicar e refaça se preciso.
          </span>
        </div>
      )}
      <div className="grid">
        {photos.map((photo) => (
          <PhotoCard
            key={photo.position}
            photo={photo}
            originalUrl={originalUrl}
            busy={inFlight.has(photo.position)}
            error={errors[photo.position] ?? null}
            onRedo={() => void run(photo.position)}
            onToggleWarning={() => void setWarning(photo.position, !photo.warn).then(refresh)}
            onOpen={() => setOpenPos(photo.position)}
          />
        ))}
      </div>
      <div className="cta">
        <span className="note">Cada refação gera só aquela foto. Clique numa foto para comparar com a original.</span>
        {allDone ? (
          <a className="btn lg" href={downloadHref}>
            <Icon name="download" />
            Baixar kit
          </a>
        ) : (
          <button type="button" className="btn lg" disabled>
            <Icon name="download" />
            Baixar kit
          </button>
        )}
      </div>
      <CompareLightbox
        photo={opened}
        originalUrl={originalUrl}
        busy={opened ? inFlight.has(opened.position) : false}
        onClose={closeViewer}
        onPrev={openIndex > 0 ? () => setOpenPos(viewable[openIndex - 1].position) : null}
        onNext={openIndex >= 0 && openIndex < viewable.length - 1 ? () => setOpenPos(viewable[openIndex + 1].position) : null}
        onRedo={() => {
          if (!opened) return;
          void run(opened.position);
          setOpenPos(null);
        }}
      />
    </div>
  );
}
