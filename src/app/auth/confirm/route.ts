import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getSupabaseServer } from '@/lib/supabase/server';

const ALLOWED: EmailOtpType[] = ['invite', 'recovery'];

/** Destino do link do e-mail de convite (ou de recuperação): abre a sessão e pede a senha. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const invalid = () => NextResponse.redirect(new URL('/login?erro=convite', origin));
  if (!tokenHash || !type || !ALLOWED.includes(type)) return invalid();

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return invalid();
  return NextResponse.redirect(new URL('/auth/definir-senha', origin));
}
