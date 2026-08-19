import type { NextConfig } from 'next';

const API_TARGET = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

// CSP baseline para la app pública (la única expuesta a internet). Es un backstop
// de defensa-en-profundidad, no una CSP con nonce (la app no tiene 0 superficie
// de XSS: cero dangerouslySetInnerHTML). Notas de por qué cada directiva es como es:
// - script-src 'unsafe-inline': Next App Router inyecta scripts inline de hidratación
//   sin nonce; 'unsafe-eval' SOLO en dev (React refresh / turbopack). En prod no va.
// - style-src 'unsafe-inline': Tailwind + next/font inyectan estilos inline.
// - img-src incluye https: por si la imagen de "nosotros" es una URL absoluta de R2
//   (las de producto son /api/... mismo origen vía el rewrite).
// - font-src 'self': next/font/google AUTO-HOSPEDA las fuentes en build (no hay
//   request a Google en runtime).
// - frame-src: hay un <iframe> de Google Maps embed (LocationCard). frame-ancestors
//   'none' (nadie nos embebe — clickjacking) es independiente y complementa X-Frame-Options.
const isDev = process.env.NODE_ENV !== 'production';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  'frame-src https://maps.google.com https://www.google.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  transpilePackages: [
    '@pos-tercos/ui',
    '@pos-tercos/brand',
    '@pos-tercos/types',
    '@pos-tercos/domain',
  ],
  async headers() {
    // Headers de seguridad base + CSP baseline (ver comentario de `CSP` arriba).
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
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
