import type { SVGProps } from 'react';

/** Ícones desenhados em traço único (24×24, traço 1.75), no mesmo estilo em todo o app. */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M9 20v-5h6v5',
  users: 'M16 20v-1.5c0-2.2-1.8-4-4-4H7c-2.2 0-4 1.8-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1.5c0-1.9-1.3-3.4-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  upload: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  image: 'M4 5h16v14H4zM8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M20 15l-4.5-4.5L6 19',
  car: 'M5 17h14M5 17v2M19 17v2M3 13l2-5.2C5.4 6.7 6.3 6 7.3 6h9.4c1 0 1.9.7 2.3 1.8L21 13v4H3v-4zM3 13h18M7 15h.01M17 15h.01',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8c0 3.9-3.1 7-7 7h-.6c-2 0-3.8-1-4.9-2.6L2.8 14.6a1.5 1.5 0 0 1 2.4-1.8L8 15.5',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  zoom: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4M11 8v6M8 11h6',
  front: 'M5 5h14v14H5zM9 9h6v6H9z',
  side: 'M4 8l8-4 8 4v8l-8 4-8-4zM12 12v8M4 8l8 4 8-4',
  back: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1',
  redo: 'M20 5v5h-5M20 10a8 8 0 1 0 1.5 5',
  alert: 'M12 4 2.5 20h19zM12 10v4M12 17h.01',
  check: 'M5 12.5 10 17 19 7',
  x: 'M6 6l12 12M18 6 6 18',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01',
  chart: 'M4 20V11M10 20V5M16 20v-6M21 20H3',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  pen: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sidebar: 'M4 5h16v14H4zM9 5v14',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Símbolo da Syntra (identidade Prumo): um "S" geométrico num quadrado petróleo, com o ponto dourado onde entra a venda. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="logo-mark">
      <rect x="2" y="2" width="60" height="60" rx="12" fill="var(--logo-bg, #06363f)" />
      <polyline points="44,20 22,20 22,32 42,32 42,44 20,44" fill="none" stroke="var(--logo-ink, #f6f4ef)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      {size >= 32 && <circle cx="44" cy="20" r="4" fill="#e0a526" />}
    </svg>
  );
}
