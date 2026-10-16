'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { STORE_LABELS } from '@/lib/kit/labels';
import { saveStoreAssetForm } from '@/lib/store/actions';

export function StoreAssetForm({ slot, currentUrl }: { slot: 0 | 1; currentUrl: string | null }) {
  const [error, formAction, pending] = useActionState(saveStoreAssetForm, null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown = preview ?? currentUrl;
  const inputId = `store-file-${slot}`;

  return (
    <form action={formAction} className="store-asset">
      <div className="head">
        <h2>Foto da loja {slot + 1}</h2>
        {currentUrl ? (
          <span className="pill ok">
            <Icon name="check" size={12} /> enviada
          </span>
        ) : (
          <span className="pill warn">falta enviar</span>
        )}
      </div>
      <p className="note">Entra como “{STORE_LABELS[slot].replace('Loja: ', '')}” no fim de cada kit.</p>
      <input type="hidden" name="slot" value={slot} />
      <label
        htmlFor={inputId}
        className={`drop${dragging ? ' dragging' : ''}${shown ? ' has-file' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          const input = document.getElementById(inputId) as HTMLInputElement | null;
          if (f && input) {
            const dt = new DataTransfer();
            dt.items.add(f);
            input.files = dt.files;
            setFile(f);
          }
        }}
      >
        {shown ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob) ou URL assinada */}
            <img className="preview" src={shown} alt={`Prévia da foto da loja ${slot + 1}`} width={240} height={240} />
            <span className="drop-caption">
              <span>{file ? file.name : 'Arte atual'}</span>
              <span className="pill gen">trocar</span>
            </span>
          </>
        ) : (
          <>
            <span className="drop-icon">
              <Icon name="upload" size={22} />
            </span>
            <strong>Solte a arte aqui</strong>
            <small>ou clique para escolher · quadrada, JPEG, PNG ou WEBP</small>
          </>
        )}
      </label>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        name="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Arte da foto da loja ${slot + 1}`}
        required
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={pending || !file}>
        <Icon name="upload" size={16} />
        {pending ? 'Enviando…' : currentUrl ? 'Substituir arte' : 'Enviar arte'}
      </button>
    </form>
  );
}
