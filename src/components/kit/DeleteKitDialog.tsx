'use client';

import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DialogError } from './DialogError';
import { GlassDialog } from './GlassDialog';

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
 * Confirmação de exclusão: capa do kit e lixeira que abre a tampa quando o botão de excluir
 * é apontado (o CSS reage ao hover do botão). O foco começa em "Cancelar", o caminho seguro.
 */
export function DeleteKitDialog({ open, name, thumbUrl, busy, error, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <GlassDialog
      open={open}
      busy={busy}
      onClose={onCancel}
      initialFocus={cancelRef}
      role="alertdialog"
      labelledBy="delete-title"
      describedBy="delete-desc"
      panelData={{ 'data-busy': busy ? '' : undefined }}
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
        <h2 id="delete-title">Excluir este kit?</h2>
        <p className="confirm-name" title={name}>{name}</p>
      </div>

      <ul id="delete-desc" className="confirm-facts">
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

      <DialogError error={error} />

      <div className="confirm-actions">
        <button ref={cancelRef} type="button" className="btn soft" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="btn danger" onClick={onConfirm} disabled={busy}>
          {busy ? <span className="btn-spinner" aria-hidden="true" /> : <Icon name="trash" size={16} />}
          {busy ? 'Excluindo…' : 'Excluir kit'}
        </button>
      </div>
    </GlassDialog>
  );
}
