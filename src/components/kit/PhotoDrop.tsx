'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

type Props = {
  id: string;
  /** Nome acessível do campo de arquivo (os testes e leitores de tela usam este texto). */
  label: string;
  file: File | null;
  invalid?: boolean;
  compact?: boolean;
  title?: ReactNode;
  hint?: ReactNode;
  onPick: (file: File | undefined) => void;
};

/** Área para soltar ou escolher uma foto, com a prévia ocupando o quadro depois de escolhida. */
export function PhotoDrop({ id, label, file, invalid, compact, title = 'Solte a foto aqui', hint = 'ou clique para escolher · JPEG, PNG ou WEBP, até 10 MB', onPick }: Props) {
  const [dragging, setDragging] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  return (
    <>
      <label
        htmlFor={id}
        className={`drop${compact ? ' compact' : ''}${dragging ? ' dragging' : ''}${preview ? ' has-file' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onPick(e.dataTransfer.files?.[0]);
        }}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob) */}
            <img className="preview" src={preview} alt={`Prévia: ${label.toLowerCase()}`} />
            <span className="drop-caption">
              <span>{file?.name}</span>
              <span className="pill gen">trocar</span>
            </span>
          </>
        ) : (
          <>
            <span className="drop-icon">
              <Icon name={dragging ? 'download' : 'upload'} size={22} />
            </span>
            <strong>{dragging ? 'Pode soltar' : title}</strong>
            <small>{hint}</small>
          </>
        )}
      </label>
      <input
        id={id}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={label}
        aria-invalid={invalid}
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </>
  );
}
