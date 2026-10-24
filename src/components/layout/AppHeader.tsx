import Link from 'next/link';
import { signOut } from '@/lib/auth/actions';
import { getSupabaseServer } from '@/lib/supabase/server';
import { Icon, LogoMark } from '@/components/ui/Icon';
import { NavLinks } from './NavLinks';
import { ThemeToggle } from './ThemeToggle';

/** Cabeçalho: marca, navegação e tema. Sem login (tela de /login), mostra só a marca e o tema. */
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
      <Link className="brand" href="/" aria-label="Syntra, início">
        <LogoMark size={34} />
        <span className="brand-text">Syntra</span>
      </Link>
      <div className="header-right">
        {signedIn && (
          <nav className="nav" aria-label="Principal">
            <NavLinks isAdmin={isAdmin} />
          </nav>
        )}
        <ThemeToggle />
        {signedIn && (
          <form action={signOut}>
            <button type="submit" className="icon-btn" aria-label="Sair" title="Sair">
              <Icon name="logout" />
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
