import type { ReactNode } from 'react';
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { AppShell } from '@/components/layout/AppShell';
import { THEME_SCRIPT } from '@/components/layout/theme';
import '@/styles/glass.css';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: { default: 'Syntra', template: '%s · Syntra' },
  description: 'Fotos que vendem. Números que guiam.',
  authors: [{ name: 'Pegasus' }],
  creator: 'Pegasus',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4ef' },
    { media: '(prefers-color-scheme: dark)', color: '#04252b' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Aplica o tema escolhido antes da primeira pintura, sem piscar. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell>
          {children}
          <footer className="credit">Made by Pegasus</footer>
        </AppShell>
        <Analytics />
      </body>
    </html>
  );
}
