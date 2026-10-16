'use client';

import { useActionState, useState } from 'react';
import { saveStoreAssetForm } from '@/lib/store/actions';

export function StoreAssetForm({ slot, currentUrl }: { slot: 0 | 1; currentUrl: string | null }) {
  const [error, formAction, pending] = useActionState(saveStoreAssetForm, null);
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? currentUrl;

  return (
    <form action={formAction} className="store-asset">
      <h2>Foto da loja {slot + 1}</h2>
      <input type="hidden" name="slot" value={slot} />
      <div className="store-asset-preview">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob) ou URL assinada
          <img src={shown} alt={`Prévia da foto da loja ${slot + 1}`} width={240} height={240} />
        ) : (
          <p>Nenhuma arte enviada ainda.</p>
        )}
      </div>
      <input
        type="file"
        name="file"
        accept="image/jpeg,image/png,image/webp"
        required
        onChange={(e) => {
          const f = e.target.files?.[0];
          setPreview(f ? URL.createObjectURL(f) : null);
        }}
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Enviando…' : currentUrl ? 'Substituir arte' : 'Enviar arte'}
      </button>
    </form>
  );
}
