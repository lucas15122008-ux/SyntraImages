import Link from 'next/link';
import { signOut } from '@/lib/auth/actions';
import { getSupabaseServer } from '@/lib/supabase/server';

/** Cabeçalho: marca e navegação. Sem login (tela de /login), mostra só a marca. */
export async function AppHeader() {
  let signedIn = false;
  let isAdmin = false;
  try {
    const sb = await getSupabaseServer();
    const { data } = await sb.auth.getUser();
    signedIn = !!data.user;
    if (data.user) {
      const { data: profile } = await sb.from('profiles').select('role').eq('id', data.user.id).single();
      isAdmin = profile?.role === 'admin';
    }
  } catch {
    // Sem Supabase configurado (ex.: primeiro build): mostra só a marca.
  }

  return (
    <header className="app-header">
      <Link className="brand" href="/">
        SyntraImages
      </Link>
      {signedIn && (
        <nav className="nav" aria-label="Principal">
          <Link href="/kits/novo">Novo kit</Link>
          <Link href="/">Meus kits</Link>
          <Link href="/configuracoes/loja">Fotos da loja</Link>
          {isAdmin && <Link href="/configuracoes/equipe">Equipe</Link>}
          <form action={signOut}>
            <button type="submit">Sair</button>
          </form>
        </nav>
      )}
    </header>
  );
}
