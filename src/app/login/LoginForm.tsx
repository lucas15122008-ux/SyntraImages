'use client';

import { useActionState } from 'react';
import { Icon, LogoMark } from '@/components/ui/Icon';
import { signIn } from '@/lib/auth/actions';

export function LoginForm({ notice }: { notice?: string }) {
  const [error, formAction, pending] = useActionState(signIn, null);

  return (
    <main className="auth-card">
      <form action={formAction} className="panel">
        <div className="auth-brand">
          <LogoMark size={48} />
          <div>
            <h1>Entrar na Syntra</h1>
            <p className="sub">Kits de fotos para anúncios, gerados a partir de uma foto da peça.</p>
          </div>
        </div>
        <label>
          E-mail
          <span className="input-icon">
            <Icon name="mail" size={16} />
            <input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required />
          </span>
        </label>
        <label>
          Senha
          <span className="input-icon">
            <Icon name="lock" size={16} />
            <input name="password" type="password" autoComplete="current-password" required />
          </span>
        </label>
        {notice && (
          <p className="alert" role="alert">
            <Icon name="alert" size={16} />
            {notice}
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn lg" disabled={pending}>
          {pending ? 'Entrando…' : 'Entrar'}
          {!pending && <Icon name="arrowRight" />}
        </button>
        <p className="note">O acesso é só por convite. Fale com o administrador para receber o seu.</p>
      </form>
    </main>
  );
}
