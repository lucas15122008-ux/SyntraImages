'use client';

import { useActionState } from 'react';
import { setPassword } from '@/lib/auth/actions';

export default function SetPasswordPage() {
  const [error, formAction, pending] = useActionState(setPassword, null);

  return (
    <main className="auth-card">
      <form action={formAction} className="panel">
        <h1>Crie a sua senha</h1>
        <p className="note">Você entrou pelo convite. Escolha uma senha para os próximos acessos.</p>
        <label>
          Senha (mínimo 8 caracteres)
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label>
          Repita a senha
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar senha'}
        </button>
      </form>
    </main>
  );
}
