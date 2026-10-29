'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { GlassDialog } from './GlassDialog';

type Props = {
  /** Posições das fotos de IA (capa e fotos do meio); as fixas da loja ficam de fora. */
  positions: number[];
  onConfirm: (positions: number[]) => void;
  /** Ainda há foto gerando: espera terminar para não pedir a mesma foto duas vezes. */
  working: boolean;
};

/** "Refazer o kit inteiro": confirma quantas gerações vai usar e manda todas para a fila. */
export function RedoKitButton({ positions, onConfirm, working }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const n = positions.length;
  if (!n) return null;

  return (
    <>
      <button type="button" className="btn ghost" onClick={() => setOpen(true)} disabled={working} title={working ? 'Espere as fotos terminarem de gerar' : undefined}>
        <Icon name="redo" size={16} />
        Refazer tudo
      </button>
      <GlassDialog open={open} onClose={() => setOpen(false)} initialFocus={cancelRef} role="alertdialog" labelledBy="redo-title" describedBy="redo-desc">
        <div className="redo-visual" aria-hidden="true" style={{ ['--c' as string]: (Math.min(5, n) - 1) / 2 }}>
          {positions.slice(0, 5).map((p, i) => (
            <span key={p} className="redo-tile" style={{ ['--i' as string]: i }}>
              {String(p).padStart(2, '0')}
            </span>
          ))}
          <span className="redo-badge">
            <Icon name="redo" size={22} />
          </span>
        </div>

        <div className="confirm-text">
          <h2 id="redo-title">Refazer o kit inteiro?</h2>
          <p className="confirm-name">{n === 1 ? '1 foto de IA será gerada de novo.' : `${n} fotos de IA serão geradas de novo.`}</p>
        </div>

        <ul id="redo-desc" className="confirm-facts">
          <li>
            <Icon name="sparkles" size={16} />
            <span>Usa o nome e o carro que estão salvos agora no kit.</span>
          </li>
          <li>
            <Icon name="store" size={16} />
            <span>As artes da loja não mudam.</span>
          </li>
          <li className="warn">
            <Icon name="clock" size={16} />
            <span>{n === 1 ? 'Usa 1 geração' : `Usa ${n} gerações`} do limite diário. As fotos atuais são trocadas pelas novas.</span>
          </li>
        </ul>

        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn soft" onClick={() => setOpen(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn redo-go"
            onClick={() => {
              setOpen(false);
              onConfirm(positions);
            }}
          >
            <Icon name="redo" size={16} />
            Refazer {n} {n === 1 ? 'foto' : 'fotos'}
          </button>
        </div>
      </GlassDialog>
    </>
  );
}
