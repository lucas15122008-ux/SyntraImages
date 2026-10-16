'use server';

import { redirect } from 'next/navigation';
import { getSupabaseAdmin, getSupabaseServer, requireAdmin } from '@/lib/supabase/server';

export type ActionResult = { ok: true } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Convida uma pessoa por e-mail. Só o administrador; não existe cadastro aberto. */
export async function inviteMember(email: string): Promise<ActionResult> {
  await requireAdmin();
  const clean = email.trim().toLowerCase();
  if (!EMAIL.test(clean)) return { ok: false, error: 'Informe um e-mail válido.' };
  const { error } = await getSupabaseAdmin().auth.admin.inviteUserByEmail(clean);
  if (error) return { ok: false, error: `Não foi possível enviar o convite: ${error.message}` };
  return { ok: true };
}

/** Entrada por e-mail e senha. Devolve a mensagem de erro; em caso de sucesso, redireciona. */
export async function signIn(_prev: string | null, formData: FormData): Promise<string | null> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return 'Informe e-mail e senha.';
  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return 'E-mail ou senha incorretos.';
  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
