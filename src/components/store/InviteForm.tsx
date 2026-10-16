'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { inviteMember } from '@/lib/auth/actions';

export function InviteForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await inviteMember(email);
      setMessage(result.ok ? { ok: true, text: `Convite enviado para ${email.trim().toLowerCase()}.` } : { ok: false, text: result.error });
      if (result.ok) setEmail('');
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível enviar o convite.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="invite-form">
      <span className="input-icon">
        <Icon name="mail" size={16} />
        <input type="email" required value={email} placeholder="email@empresa.com.br" aria-label="E-mail da pessoa" onChange={(e) => setEmail(e.target.value)} />
      </span>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Enviando…' : 'Enviar convite'}
        {!busy && <Icon name="arrowRight" size={16} />}
      </button>
      {message &&
        (message.ok ? (
          <p className="status-ok" role="status" style={{ flexBasis: '100%' }}>
            <Icon name="check" size={16} />
            {message.text}
          </p>
        ) : (
          <p className="field-error" role="alert" style={{ flexBasis: '100%' }}>
            {message.text}
          </p>
        ))}
    </form>
  );
}
