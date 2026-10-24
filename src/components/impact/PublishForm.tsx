'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { markPublished, removeSwitch } from '@/lib/ml/photo-actions';

/** "Publiquei as fotos no anúncio X no dia Y": é o marco que a tela Foto x venda compara. */
export function PublishForm({ kitId, today }: { kitId?: string; today: string }) {
  const router = useRouter();
  const [item, setItem] = useState('');
  const [day, setDay] = useState(today);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await markPublished({ item, day, kitId });
      setMessage(result.ok ? { ok: true, text: `Registrado: ${result.title}.` } : { ok: false, text: result.error });
      if (result.ok) {
        setItem('');
        router.refresh();
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível registrar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="publish-form">
      <span className="input-icon">
        <Icon name="tag" size={16} />
        <input type="text" required value={item} placeholder="MLB… ou link do anúncio" aria-label="Código ou link do anúncio" onChange={(e) => setItem(e.target.value)} />
      </span>
      <input type="date" required value={day} max={today} aria-label="Dia em que as fotos foram trocadas" onChange={(e) => setDay(e.target.value)} />
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Conferindo…' : 'Registrar troca'}
        {!busy && <Icon name="check" size={16} />}
      </button>
      {message &&
        (message.ok ? (
          <p className="status-ok msg" role="status">
            <Icon name="check" size={16} />
            {message.text}
          </p>
        ) : (
          <p className="field-error msg" role="alert">
            {message.text}
          </p>
        ))}
    </form>
  );
}

export function RemoveSwitch({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost"
      disabled={busy}
      aria-label={`Remover ${label}`}
      title="Remover da comparação"
      onClick={async () => {
        if (!confirm(`Tirar ${label} da comparação?`)) return;
        setBusy(true);
        try {
          await removeSwitch(id);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="x" size={14} />
    </button>
  );
}
