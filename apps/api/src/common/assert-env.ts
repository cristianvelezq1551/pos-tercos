/**
 * Validación de variables de entorno críticas al ARRANQUE. Sin esto, un
 * secret ausente recién explota en runtime (ej. el primer login firma JWT
 * con secret undefined) — acá el proceso muere temprano con un mensaje claro.
 */
// NOTA: JWT_REFRESH_SECRET NO se exige — los refresh tokens son opacos
// (random + SHA-256 en DB), no JWT firmados. Pedirlo daba falsa confianza.
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_ACCESS_SECRET'] as const;

/**
 * §CN-003: TODO el endurecimiento de prod colgaba de `NODE_ENV === 'production'`
 * evaluado en tres lugares distintos, y NADA verificaba que la variable
 * estuviera seteada. Un typo en Railway (`Production`, `prod`, o ausente) hacía
 * que el proceso arrancara EN SILENCIO con:
 *   - CORS `origin: true` + `credentials: true` (cualquier origen, con sesión)
 *   - cookies de auth sin `Secure`
 *   - todo `REQUIRED_ENV_PROD` salteado (incluido el piso de entropía)
 * El propio `assertRequiredEnv` no podía detectarlo porque estaba detrás de la
 * misma condición. Acá se resuelve UNA vez y se exporta como fuente única.
 */
const KNOWN_APP_ENVS: readonly string[] = ['development', 'test', 'qa', 'production'];

const LOCAL_DB_HOSTS = ['localhost', '127.0.0.1', 'host.docker.internal'];

function dbLooksLocal(): boolean {
  try {
    return LOCAL_DB_HOSTS.includes(new URL(process.env.DATABASE_URL ?? '').hostname);
  } catch {
    return false;
  }
}

/**
 * OJO: esto NO se evalúa al importar el módulo. Nada carga `.env` antes de que
 * corran los imports (verificado empíricamente), así que validar en module-load
 * mataba el arranque en dev con "DATABASE_URL apunta a host remoto". La
 * validación vive dentro de `assertRequiredEnv()`, que ya hoy lee DATABASE_URL
 * con éxito; `isProd()` se evalúa perezosamente en cada uso.
 */
function assertKnownAppEnv(): void {
  const raw = process.env.APP_ENV ?? process.env.NODE_ENV;

  if (raw) {
    if (!KNOWN_APP_ENVS.includes(raw)) {
      throw new Error(
        `APP_ENV/NODE_ENV="${raw}" no es un valor conocido. ` +
          `Permitidos: ${KNOWN_APP_ENVS.join(' | ')}. Un error de escritura aquí deshabilita ` +
          'CORS estricto, cookies Secure y las validaciones de secretos de prod.',
      );
    }
    return;
  }

  // Sin variable: solo aceptable en una máquina de desarrollo (DB local).
  // Contra una DB remota es casi seguro un deploy mal configurado → morir acá.
  if (!dbLooksLocal()) {
    throw new Error(
      'APP_ENV/NODE_ENV no está seteada y DATABASE_URL apunta a un host remoto. ' +
        'Sin declarar el entorno, la API arrancaría con CORS abierto (origin: true ' +
        '+ credentials) y cookies de sesión sin Secure. ' +
        'Configura NODE_ENV=production en el servicio (deploy.md §1.2).',
    );
  }
}

/** Fuente ÚNICA del flag de producción. No re-leer `process.env.NODE_ENV` suelto. */
export function isProd(): boolean {
  return (process.env.APP_ENV ?? process.env.NODE_ENV) === 'production';
}

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
  ['KAPSO_API_KEY', 'sin KAPSO_* el WhatsApp queda en MOCK: cero notificaciones reales'],
  [
    'ALERT_GITHUB_TOKEN',
    'sin ALERT_GITHUB_* un error 500 no le avisa a nadie: queda solo en el log de Railway',
  ],
];

/** Secretos que en prod deben tener entropía mínima (no un placeholder débil). */
const MIN_SECRET_LENGTH = 32;
const SECRETS_WITH_FLOOR = ['JWT_ACCESS_SECRET', 'WEB_ORDER_TOKEN_SECRET'] as const;

export function assertRequiredEnv(): void {
  // PRIMERO: sin un entorno declarado y válido, todo lo de abajo se saltea solo.
  assertKnownAppEnv();
  const IS_PROD = isProd();

  const missing: string[] = [];
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) missing.push(key);
  }
  if (IS_PROD) {
    for (const key of REQUIRED_ENV_PROD) {
      if (!process.env[key]) missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno requeridas ausentes: ${missing.join(', ')}. ` +
        'Revisa apps/api/.env (dev) o las variables del servicio (prod).',
    );
  }

  // §2.4: los selectores de adapter deben ser uno de los valores conocidos. Un
  // typo (ej. "R2 " con espacio, "cloudflare") caía a `local` con solo un log →
  // en prod eso es pérdida de fotos/recibos en el filesystem EFÍMERO de Railway.
  // Se valida SIEMPRE (dev y prod): un valor inválido mata el boot.
  const enumEnv: ReadonlyArray<[string, readonly string[]]> = [
    ['STORAGE_PROVIDER', ['local', 'r2']],
    ['PRINTER_PROVIDER', ['local', 'escpos']],
  ];
  for (const [key, allowed] of enumEnv) {
    const v = process.env[key];
    if (v !== undefined && !allowed.includes(v)) {
      throw new Error(
        `${key}="${v}" no es un valor válido. Permitidos: ${allowed.join(' | ')}.`,
      );
    }
  }

  // Piso de entropía en prod: un secret presente pero trivial (ej. "secret")
  // arrancaría sin alarma y firma tokens triviales de forjar.
  if (IS_PROD) {
    const weak = SECRETS_WITH_FLOOR.filter((key) => {
      const v = process.env[key];
      return v !== undefined && v.length < MIN_SECRET_LENGTH;
    });
    if (weak.length > 0) {
      throw new Error(
        `Secretos demasiado cortos (mínimo ${MIN_SECRET_LENGTH} caracteres): ${weak.join(', ')}. ` +
          'Genera uno aleatorio: `openssl rand -base64 48`.',
      );
    }

    for (const [key, consequence] of PROD_FEATURE_WARNINGS) {
      if (!process.env[key]) {
        console.warn(`⚠️  [env] ${key} no está seteada en producción — ${consequence}.`);
      }
    }

    // §2.4: STORAGE_PROVIDER=local en prod escribe al filesystem efímero de
    // Railway → las fotos de facturas/comprobantes se pierden en cada redeploy.
    // Debe ser una elección EXPLÍCITA (ALLOW_LOCAL_STORAGE=1), no un default.
    if (process.env.STORAGE_PROVIDER === 'local' && process.env.ALLOW_LOCAL_STORAGE !== '1') {
      throw new Error(
        'STORAGE_PROVIDER=local en producción pierde las fotos en cada redeploy ' +
          '(filesystem efímero). Usa `r2` + R2_* (deploy.md §1.2). Si de verdad ' +
          'quieres local a propósito: ALLOW_LOCAL_STORAGE=1.',
      );
    }

    // §2.5: el pedido web y las alertas antifraude dependen 100% de WhatsApp.
    // Con WHATSAPP_REQUIRED=true (recomendado en prod) la ausencia TOTAL de
    // proveedor deja de ser un warning y mata el boot — mejor no arrancar que
    // arrancar mudo (el cliente nunca recibiría cómo pagar).
    if (process.env.WHATSAPP_REQUIRED === 'true' && !process.env.KAPSO_API_KEY) {
      throw new Error(
        'WHATSAPP_REQUIRED=true pero no hay proveedor configurado: configura KAPSO_*. ' +
          'Sin WhatsApp el cliente nunca recibe cómo pagar y no salen alertas al dueño.',
      );
    }

    // TRUST_PROXY_HOPS: el rate-limit (anti-fuerza-bruta de login y PINs) cuenta
    // por IP, derivada de X-Forwarded-For según cuántos proxies confiables hay
    // delante. En prod DEBE estar seteada a un entero >= 1 EXACTO (Cloudflare→
    // Railway = 2). Sin ella `main.ts` caía a 1 en silencio → o auto-DoS del login
    // (todos en el bucket del edge de CF), o si se sube de más, X-Forwarded-For
    // spoofeable → bypass de fuerza bruta. Fallar el boot obliga a decidirlo.
    const hopsRaw = process.env.TRUST_PROXY_HOPS;
    const hops = Number(hopsRaw);
    if (!hopsRaw || !Number.isInteger(hops) || hops < 1) {
      throw new Error(
        `TRUST_PROXY_HOPS debe ser un entero >= 1 en producción (Cloudflare→Railway = 2); ` +
          `valor actual: ${hopsRaw ?? 'ausente'}. Verifica req.ip real en QA ` +
          '(ver ir-a-prod-y-entornos.md §6).',
      );
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
