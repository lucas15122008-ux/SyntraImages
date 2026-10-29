'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { deleteKitAction } from '@/lib/kit/actions';
import { DeleteKitDialog } from './DeleteKitDialog';

type Props = { kitId: string; name: string; thumbUrl?: string | null; compact?: boolean };

/**
 * Exclui o kit depois de confirmar no pop-up. `compact` é o botão redondo do cartão na galeria;
 * sem ele, o botão da tela do kit, que volta para "Meus kits" ao terminar.
 */
export function DeleteKitButton({ kitId, name, thumbUrl = null, compact = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await deleteKitAction(kitId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Fecha primeiro para o pop-up sair animado; depois o cartão some da grade.
    setOpen(false);
    if (compact) router.refresh();
    else router.push('/');
  }

  return (
    <>
      {compact ? (
        <button type="button" className="kit-delete" onClick={() => setOpen(true)} aria-label={`Excluir o kit ${name}`} title="Excluir kit">
          <Icon name="trash" size={16} />
        </button>
      ) : (
        <button type="button" className="btn lg soft kit-delete-btn" onClick={() => setOpen(true)}>
          <Icon name="trash" size={16} />
          Excluir kit
        </button>
      )}
      <DeleteKitDialog open={open} name={name} thumbUrl={thumbUrl} busy={busy} error={error} onCancel={cancel} onConfirm={() => void confirm()} />
    </>
  );
}
