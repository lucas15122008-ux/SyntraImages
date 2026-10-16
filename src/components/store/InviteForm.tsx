'use client';

import { useState } from 'react';
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
      <input type="email" required value={email} placeholder="email@empresa.com.br" aria-label="E-mail da pessoa" onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Enviando…' : 'Enviar convite'}
      </button>
      {message && (
        <p className={message.ok ? 'note' : 'field-error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </form>
  );
}
