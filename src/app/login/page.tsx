'use client';

import { useActionState } from 'react';
import { signIn } from '@/lib/auth/actions';

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(signIn, null);

  return (
    <main className="auth-card">
      <form action={formAction} className="panel">
        <h1>Entrar no SyntraImages</h1>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="note">O acesso é só por convite. Fale com o administrador para receber o seu.</p>
      </form>
    </main>
  );
}
