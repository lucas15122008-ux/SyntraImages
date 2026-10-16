import type { ReactNode } from 'react';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { AppHeader } from '@/components/layout/AppHeader';
import { THEME_SCRIPT } from '@/components/layout/theme';
import '@/styles/glass.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: { default: 'SyntraImages', template: '%s · SyntraImages' },
  description: 'Kits de fotos para anúncios, gerados por IA.',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#d4e8ef' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1820' },
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
        <div className="backdrop" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="wrap">
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
