'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { signOut } from '@/lib/auth/actions';
import { Icon, LogoMark } from '@/components/ui/Icon';
import { NavLinks } from './NavLinks';
import { ThemeToggle } from './ThemeToggle';

const COLLAPSE_KEY = 'syntra-sidebar-collapsed';
const listeners = new Set<() => void>();

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function subscribeCollapsed(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    // Sem armazenamento (aba anônima): vale só até recarregar.
  }
  listeners.forEach((fn) => fn());
}

/**
 * Menu lateral fixo no computador (pode encolher só para os ícones) e gaveta no celular,
 * aberta pelo botão de menu da barra do topo.
 */
export function SidebarShell({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  const pathname = usePathname();
  // A gaveta guarda em que página foi aberta: ao trocar de página, fecha sozinha.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt !== null && openAt === pathname;
  const setOpen = (value: boolean) => setOpenAt(value ? pathname : null);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenAt(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="shell" data-collapsed={collapsed}>
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}>
          <Icon name="menu" />
        </button>
        <Link className="brand" href="/" aria-label="Syntra, início">
          <LogoMark size={30} />
          <span className="brand-text">Syntra</span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="sidebar-scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className="sidebar" data-open={open} aria-label="Menu">
        <div className="sidebar-head">
          <Link className="brand" href="/" aria-label="Syntra, início">
            <LogoMark size={32} />
            <span className="brand-text">Syntra</span>
          </Link>
          <button
            type="button"
            className="sidebar-collapse"
            onClick={() => writeCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <Icon name="sidebar" size={18} />
          </button>
          <button type="button" className="sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav className="side-nav" aria-label="Principal">
          <NavLinks isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
        </nav>

        <div className="sidebar-foot">
          <ThemeToggle />
          <form action={signOut}>
            <button type="submit" className="side-logout" aria-label="Sair" title="Sair">
              <Icon name="logout" size={18} />
              <span className="nav-text">Sair</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="shell-main">
        <div className="wrap">{children}</div>
      </div>
    </div>
  );
}
