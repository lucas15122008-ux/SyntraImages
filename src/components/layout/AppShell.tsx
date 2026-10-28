import Link from 'next/link';
import type { ReactNode } from 'react';
import { getSupabaseServer } from '@/lib/supabase/server';
import { LogoMark } from '@/components/ui/Icon';
import { SidebarShell } from './SidebarShell';
import { ThemeToggle } from './ThemeToggle';

/** Moldura do app: com login, menu lateral; sem login (tela de /login), só a marca e o tema no topo. */
export async function AppShell({ children }: { children: ReactNode }) {
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

  if (signedIn) return <SidebarShell isAdmin={isAdmin}>{children}</SidebarShell>;

  return (
    <div className="wrap">
      <header className="app-header">
        <Link className="brand" href="/" aria-label="Syntra, início">
          <LogoMark size={34} />
          <span className="brand-text">Syntra</span>
        </Link>
        <ThemeToggle />
      </header>
      {children}
    </div>
  );
}
