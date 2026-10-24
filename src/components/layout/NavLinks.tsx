'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { Icon, type IconName } from '@/components/ui/Icon';

type Item = { href: string; label: string; icon: IconName };

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || (pathname.startsWith('/kits/') && pathname !== '/kits/novo');
  return pathname.startsWith(href);
}

/** Navegação principal: a pílula de destaque desliza até a página atual. */
export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? '/';
  const reduced = usePrefersReducedMotion();
  const items: Item[] = [
    { href: '/kits/novo', label: 'Novo kit', icon: 'plus' },
    { href: '/', label: 'Meus kits', icon: 'grid' },
    { href: '/configuracoes/loja', label: 'Fotos da loja', icon: 'store' },
    { href: '/configuracoes/mercado-livre', label: 'Mercado Livre', icon: 'layers' },
    ...(isAdmin
      ? ([
          { href: '/faturamento', label: 'Faturamento', icon: 'chart' },
          { href: '/promocoes', label: 'Promoções', icon: 'tag' },
          { href: '/concorrentes', label: 'Concorrentes', icon: 'flag' },
          { href: '/configuracoes/equipe', label: 'Equipe', icon: 'users' },
        ] as Item[])
      : []),
  ];

  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} aria-label={item.label}>
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="nav-pill"
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
              />
            )}
            <Icon name={item.icon} size={16} />
            <span className="nav-text">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
