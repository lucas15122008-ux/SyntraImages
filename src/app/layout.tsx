import type { ReactNode } from 'react';

export const metadata = {
  title: 'SyntraImages',
  description: 'Kits de fotos para anúncios, gerados por IA.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
