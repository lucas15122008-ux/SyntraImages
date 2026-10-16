'use client';

import { useActionState } from 'react';
import { signIn } from '@/lib/auth/actions';

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(signIn, null);

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 16 }}>
      <form action={formAction} style={{ display: 'grid', gap: 12, width: 'min(360px, 100%)' }}>
        <h1>Entrar no SyntraImages</h1>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
        <p>O acesso é só por convite. Fale com o administrador para receber o seu.</p>
      </form>
    </main>
  );
}
