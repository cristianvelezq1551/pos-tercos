import type { NextConfig } from 'next';

const API_TARGET = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

// CSP del admin. Acá vive TODA la plata (ventas, caja, nómina, tesorería), así
// que es el blanco más valioso del sistema y hasta ahora era la única app sin
// CSP. Es defensa en profundidad: la app no tiene `dangerouslySetInnerHTML`,
// pero sí renderiza texto que escriben personas (nombres de producto, notas de
// venta, incidencias de cocina).
//
// Por qué cada directiva es como es:
// - script-src 'unsafe-inline': Next App Router inyecta scripts de hidratación
//   sin nonce. 'unsafe-eval' SOLO en dev (React refresh / turbopack).
// - img-src / media-src https:: las fotos de factura, el B-roll y las pistas de
//   música se sirven desde R2 (otro origen).
// - connect-src incluye el origen del WebSocket de pedidos web, que en prod es
//   el dominio de la API (otro origen). Sin esto el socket muere en silencio.
const isDev = process.env.NODE_ENV !== 'production';
const WS_ORIGIN = process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:3001';
const WS_SOURCES = (() => {
  try {
    const u = new URL(WS_ORIGIN);
    const ws = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${u.origin} ${ws}//${u.host}`;
  } catch {
    return '';
  }
})();
// La caja le habla DIRECTO al print-agent desde el navegador (comanda +
// factura al vender, y /caja/configuracion). Sin su origen en connect-src la
// CSP bloquea la impresión EN SILENCIO: la venta sigue (best-effort) pero
// nunca sale papel, y la causa solo se ve en la consola del navegador.
// Detectado en el recorrido de navegador 2026-08-14.
const PRINT_AGENT_SOURCE = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_PRINT_AGENT_URL ?? 'http://localhost:9120').origin;
  } catch {
    return '';
  }
})();
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  `connect-src 'self' ${WS_SOURCES} ${PRINT_AGENT_SOURCE}`.replace(/\s+/g, ' ').trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

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
    '@pos-tercos/guia',
  ],
  async headers() {
    // Headers de seguridad base + CSP (ver el bloque `CSP` de arriba).
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
