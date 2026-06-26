/**
 * Origen CORS para los WebSocket gateways. Espeja la política HTTP de `main.ts`:
 * en prod se exige una allowlist explícita (`CORS_ORIGINS`, separada por comas);
 * sin la var (dev) se refleja cualquier origen. Reflejar todo con credenciales
 * en prod sería superficie para conexiones cross-site no deseadas — el handshake
 * exige JWT, pero la postura debe ser consistente con el plano HTTP.
 */
export function wsCorsOrigin(): string[] | boolean {
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
  return origins.length ? origins : true;
}
