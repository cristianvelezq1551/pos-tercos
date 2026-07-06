/**
 * Validación de variables de entorno críticas al ARRANQUE. Sin esto, un
 * secret ausente recién explota en runtime (ej. el primer login firma JWT
 * con secret undefined) — acá el proceso muere temprano con un mensaje claro.
 */
// NOTA: JWT_REFRESH_SECRET NO se exige — los refresh tokens son opacos
// (random + SHA-256 en DB), no JWT firmados. Pedirlo daba falsa confianza.
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_ACCESS_SECRET'] as const;

/** Requeridas solo en producción (en dev tienen fallback o mock).
 *  CORS_ORIGINS: main.ts también la valida, pero acá sale en la MISMA lista
 *  de faltantes. STORAGE_PROVIDER: sin ella la API arranca en modo `local` y
 *  escribe uploads al filesystem EFÍMERO de Railway — pérdida silenciosa de
 *  fotos en cada redeploy; en prod debe ser una elección explícita. */
const REQUIRED_ENV_PROD = ['WEB_ORDER_TOKEN_SECRET', 'CORS_ORIGINS', 'STORAGE_PROVIDER'] as const;

/** Features de negocio que en prod mueren EN SILENCIO si falta su var (no
 *  bloquean el boot, pero el warning queda gritado en el log de arranque). */
const PROD_FEATURE_WARNINGS: ReadonlyArray<[string, string]> = [
  ['OWNER_WHATSAPP_PHONE', 'sin ella NO salen alertas antifraude ni el digest diario al dueño'],
  ['PRINTER_PROVIDER', 'sin `escpos` los recibos se "imprimen" a archivos locales efímeros'],
  ['TZ', 'los crons y cortes de día asumen TZ=America/Bogota; sin ella corren en UTC'],
  ['KAPSO_API_KEY', 'sin KAPSO_* (ni OPENWA_*) el WhatsApp queda en MOCK: cero notificaciones reales'],
];

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

    for (const [key, consequence] of PROD_FEATURE_WARNINGS) {
      if (!process.env[key]) {
        console.warn(`⚠️  [env] ${key} no está seteada en producción — ${consequence}.`);
      }
    }

    // Print-agent accesible por red SIN secret = cualquier web que visite el
    // operador puede abrir el cajón monedero. Si se eligió escpos en prod, el
    // secret es OBLIGATORIO (checklist humano → invariante del boot).
    if (process.env.PRINTER_PROVIDER === 'escpos' && !process.env.PRINT_AGENT_SECRET) {
      throw new Error(
        'PRINTER_PROVIDER=escpos en producción exige PRINT_AGENT_SECRET ' +
          '(el mismo valor en el print-agent). Sin él, el agent queda abierto ' +
          'a cualquier página web del operador (apertura del cajón).',
      );
    }

    // El default de pool de Prisma (num_cpu×2+1) es muy chico en planes hobby:
    // un burst de cobros concurrentes lo agota. SALE_TX_OPTS.maxWait mitiga,
    // pero el pool necesita holgura explícita (ver deploy.md §1.2).
    if (!/[?&]connection_limit=/.test(process.env.DATABASE_URL ?? '')) {
      console.warn(
        '⚠️  [env] DATABASE_URL sin `connection_limit` — el pool default de Prisma ' +
          'se deriva del nº de CPU y en planes chicos queda en ~3-5. Recomendado: ' +
          '`?connection_limit=15` (ver deploy.md §1.2).',
      );
    }
  }
}
