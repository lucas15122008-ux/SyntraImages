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

const MIN_PASSWORD = 8;

/** Define a senha de quem acabou de aceitar o convite (ou recuperar a conta). */
export async function setPassword(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (password !== confirm) return 'As duas senhas não são iguais.';
  const supabase = await getSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return 'O link expirou. Peça um novo convite ao administrador.';
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return 'Não foi possível salvar a senha. Tente de novo.';
  redirect('/');
}
