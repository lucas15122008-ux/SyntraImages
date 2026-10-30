'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { Icon, type IconName } from '@/components/ui/Icon';

type Item = { href: string; label: string; icon: IconName };
type Group = { title: string; items: Item[] };

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || (pathname.startsWith('/kits/') && pathname !== '/kits/novo');
  return pathname.startsWith(href);
}

/** Todas as entradas do menu, em grupos. Gestão só aparece para admin. */
export function navGroups(isAdmin: boolean): Group[] {
  return [
    { title: 'Início', items: [{ href: '/resumo', label: 'Resumo', icon: 'dashboard' }] },
    {
      title: 'Fotos',
      items: [
        { href: '/kits/novo', label: 'Novo kit', icon: 'plus' },
        { href: '/', label: 'Meus kits', icon: 'grid' },
        { href: '/configuracoes/loja', label: 'Fotos da loja', icon: 'store' },
        { href: '/configuracoes/mercado-livre', label: 'Mercado Livre', icon: 'layers' },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: 'Gestão',
            items: [
              { href: '/faturamento', label: 'Faturamento', icon: 'chart' },
              { href: '/produtos', label: 'Produtos', icon: 'box' },
              { href: '/promocoes', label: 'Promoções', icon: 'tag' },
              { href: '/foto-x-venda', label: 'Foto x venda', icon: 'image' },
              { href: '/concorrentes', label: 'Concorrentes', icon: 'flag' },
              { href: '/configuracoes/equipe', label: 'Equipe', icon: 'users' },
              { href: '/configuracoes/api', label: 'API e MCP', icon: 'lock' },
            ] as Item[],
          },
        ]
      : []),
  ];
}

/** Navegação principal do menu lateral: o fundo de destaque desliza até a página atual. */
export function NavLinks({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname() ?? '/';
  const reduced = usePrefersReducedMotion();

  return (
    <>
      {navGroups(isAdmin).map((group) => (
        <div key={group.title} className="nav-group">
          <p className="nav-group-title">{group.title}</p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                onClick={onNavigate}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="nav-pill"
                    transition={reduced ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <Icon name={item.icon} size={18} />
                <span className="nav-text">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}
