'use client';

import { useActionState } from 'react';
import { Icon, LogoMark } from '@/components/ui/Icon';
import { setPassword } from '@/lib/auth/actions';

export default function SetPasswordPage() {
  const [error, formAction, pending] = useActionState(setPassword, null);

  return (
    <main className="auth-card">
      <form action={formAction} className="panel">
        <div className="auth-brand">
          <LogoMark size={48} />
          <div>
            <h1>Crie a sua senha</h1>
            <p className="sub">Você entrou pelo convite. Escolha uma senha para os próximos acessos.</p>
          </div>
        </div>
        <label>
          Senha (mínimo 8 caracteres)
          <span className="input-icon">
            <Icon name="lock" size={16} />
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </span>
        </label>
        <label>
          Repita a senha
          <span className="input-icon">
            <Icon name="lock" size={16} />
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </span>
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn lg" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar senha'}
        </button>
      </form>
    </main>
  );
}
