/**
 * Validación de variables de entorno críticas al ARRANQUE. Sin esto, un
 * secret ausente recién explota en runtime (ej. el primer login firma JWT
 * con secret undefined) — acá el proceso muere temprano con un mensaje claro.
 */
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;

/** Requeridas solo en producción (en dev tienen fallback o mock). */
const REQUIRED_ENV_PROD = ['WEB_ORDER_TOKEN_SECRET'] as const;

export function assertRequiredEnv(): void {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) missing.push(key);
  }
  if (process.env.NODE_ENV === 'production') {
    for (const key of REQUIRED_ENV_PROD) {
      if (!process.env[key]) missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno requeridas ausentes: ${missing.join(', ')}. ` +
        'Revisá apps/api/.env (dev) o las vars del servicio (prod).',
    );
  }
}
