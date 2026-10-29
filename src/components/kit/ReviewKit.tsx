'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
  /**
   * Botões ao lado do título (editar, refazer tudo). `redo` gera de novo as posições pedidas,
   * na mesma fila de no máximo 3 por vez; `working` diz se ainda há foto gerando.
   */
  actions?: (ctx: ActionsCtx) => ReactNode;
  /** Botões ao lado de "Baixar kit" (excluir). */
  footerActions?: ReactNode;
};

export function ReviewKit({ title, originalUrl, photos, generate, setWarning, refresh, downloadHref, autoStart = true, actions, footerActions }: Props) {
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

  /** Gera as posições em fila, no máximo 3 por vez. */
  const runQueue = useCallback(
    (positions: number[]) => {
      const queue = [...positions];
      const worker = async () => {
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) await run(next);
      };
      void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    },
    [run],
  );

  // Gera sozinho as fotos pendentes.
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    runQueue(photos.filter((p) => p.kind !== 'fixed' && p.status === 'pending').map((p) => p.position));
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
        <div className="review-title-row">
          <div className="head">
            <h2>{title}</h2>
            <span className="note">{photos.length} fotos. Refaça só as que não servem.</span>
          </div>
          {actions && <div className="review-actions"><TitleActions render={actions} redo={runQueue} working={working} /></div>}
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
        <div className="cta-actions">
          {footerActions}
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

type ActionsCtx = { redo: (positions: number[]) => void; working: boolean };

/** Desenha os botões do título; como componente, a fila de geração entra só como prop de evento. */
function TitleActions({ render, ...ctx }: ActionsCtx & { render: (ctx: ActionsCtx) => ReactNode }) {
  return render(ctx);
}
