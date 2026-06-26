/**
 * Validación de variables de entorno críticas al ARRANQUE. Sin esto, un
 * secret ausente recién explota en runtime (ej. el primer login firma JWT
 * con secret undefined) — acá el proceso muere temprano con un mensaje claro.
 */
// NOTA: JWT_REFRESH_SECRET NO se exige — los refresh tokens son opacos
// (random + SHA-256 en DB), no JWT firmados. Pedirlo daba falsa confianza.
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_ACCESS_SECRET'] as const;

/** Requeridas solo en producción (en dev tienen fallback o mock). */
const REQUIRED_ENV_PROD = ['WEB_ORDER_TOKEN_SECRET'] as const;

/** Secretos que en prod deben tener entropía mínima (no un placeholder débil). */
const MIN_SECRET_LENGTH = 32;
const SECRETS_WITH_FLOOR = ['JWT_ACCESS_SECRET', 'WEB_ORDER_TOKEN_SECRET'] as const;

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

  // Piso de entropía en prod: un secret presente pero trivial (ej. "secret")
  // arrancaría sin alarma y firma tokens triviales de forjar.
  if (process.env.NODE_ENV === 'production') {
    const weak = SECRETS_WITH_FLOOR.filter((key) => {
      const v = process.env[key];
      return v !== undefined && v.length < MIN_SECRET_LENGTH;
    });
    if (weak.length > 0) {
      throw new Error(
        `Secretos demasiado cortos (mínimo ${MIN_SECRET_LENGTH} caracteres): ${weak.join(', ')}. ` +
          'Generá uno aleatorio: `openssl rand -base64 48`.',
      );
    }
  }
}
