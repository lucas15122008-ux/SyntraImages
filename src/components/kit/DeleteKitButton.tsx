'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { deleteKitAction } from '@/lib/kit/actions';

/**
 * Exclui o kit depois de confirmar. `compact` é o botão redondo do cartão na galeria;
 * sem ele, o botão da tela do kit, que volta para "Meus kits" ao terminar.
 */
export function DeleteKitButton({ kitId, name, compact = false }: { kitId: string; name: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(`Excluir o kit "${name}"? As fotos geradas serão apagadas e não dá para desfazer.`)) return;
    setBusy(true);
    const res = await deleteKitAction(kitId);
    if (!res.ok) {
      setBusy(false);
      window.alert(res.error);
      return;
    }
    if (compact) router.refresh();
    else router.push('/');
  }

  if (compact) {
    return (
      <button type="button" className="kit-delete" onClick={() => void onClick()} disabled={busy} aria-label={`Excluir o kit ${name}`} title="Excluir kit">
        <Icon name="trash" size={16} />
      </button>
    );
  }
  return (
    <button type="button" className="btn ghost danger" onClick={() => void onClick()} disabled={busy}>
      <Icon name="trash" size={16} />
      {busy ? 'Excluindo…' : 'Excluir kit'}
    </button>
  );
}
