import type { NextConfig } from 'next';

const API_TARGET = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  experimental: {
    // Los uploads del admin pasan por el middleware que proxya /api. El default
    // (10 MB) truncaba el body y el backend moría con "Request aborted" — el
    // techo real es 50 MB (pistas de audio del turnero y video de publicidad).
    middlewareClientMaxBodySize: '55mb',
  },
  transpilePackages: [
    '@pos-tercos/ui',
    '@pos-tercos/brand',
    '@pos-tercos/types',
    '@pos-tercos/domain',
  ],
  async headers() {
    // Headers de seguridad base (sin CSP estricta — necesita tuning por app).
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_TARGET}/:path*`,
      },
    ];
  },
};

export default nextConfig;
