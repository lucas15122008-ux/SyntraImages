import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Fotos de produto de até 10 MB chegam por server action (o padrão é 1 MB).
    serverActions: { bodySizeLimit: '25mb' },
  },
};

export default nextConfig;
