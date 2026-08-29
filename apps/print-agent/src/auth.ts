import { timingSafeEqual } from 'crypto';

/**
 * Frontera de seguridad del agent. Extraído de `main.ts` para poder testearlo:
 * este archivo decide quién puede abrir el cajón monedero e imprimir.
 */

export const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'] as const;

/** Compara el secret en tiempo constante (evita fuga por timing sobre la LAN). */
export function secretOk(
  headerVal: string | string[] | undefined,
  sharedSecret: string | null,
): boolean {
  if (!sharedSecret) return true; // sin secret → auth off (protegido por HOST loopback)
  const provided = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(sharedSecret);
  // Longitudes distintas: no llamar timingSafeEqual (lanza).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * A qué interfaz escucha. El CORS `*` es obligatorio para el Private Network
 * Access de Chrome y NO protege nada — la protección REAL es esta regla:
 *
 * - SIN secret → solo `127.0.0.1`: inalcanzable desde la LAN, nadie de la red
 *   puede abrir el cajón. (Caso: agent en la misma PC que el navegador del POS.)
 * - CON secret → toda la red (`0.0.0.0`), pero cada request trae el secret.
 *   (Caso: agent en la Pi sirviendo tablets por LAN.)
 *
 * `explicitHost` (PRINT_AGENT_HOST) permite forzar la interfaz a mano.
 */
export function resolveHost(sharedSecret: string | null, explicitHost?: string): string {
  if (explicitHost) return explicitHost;
  return sharedSecret ? '0.0.0.0' : '127.0.0.1';
}

/**
 * ¿Quedó expuesto a la red SIN secret? Es la combinación peligrosa: cualquier
 * dispositivo de la LAN podría imprimir y abrir el cajón. Solo puede pasar
 * forzando `PRINT_AGENT_HOST` a mano.
 */
export function isDangerouslyExposed(sharedSecret: string | null, host: string): boolean {
  return !sharedSecret && !(LOOPBACK_HOSTS as readonly string[]).includes(host);
}

/**
 * ─── Origen del navegador ────────────────────────────────────────────────
 *
 * El secreto compartido NO puede ser la defensa contra una página web: el
 * navegador del mostrador le pega al agent directo (features/sales/api/print.ts)
 * y meter el secreto ahí lo publicaría en el bundle. Sin una barrera de origen,
 * `Access-Control-Allow-Origin: *` + `Allow-Private-Network` dejan que
 * CUALQUIER página que abra el cajero imprima y abra el cajón — y con un
 * formulario `text/plain` ni siquiera hay preflight que lo frene.
 *
 * La barrera es el header `Origin`, que lo pone el navegador y una página no
 * puede falsificar. Reglas, de más permisiva a más estricta:
 *
 *  1. Sin `Origin` → pasa. No es un navegador: es la API (adapter escpos),
 *     `curl` o el chequeo de vida. Una página web NO puede omitirlo en un POST.
 *  2. `localhost` / `127.0.0.1` en cualquier puerto → pasa. Cubre todo el
 *     desarrollo sin configurar nada, y ninguna página ajena puede presentarse
 *     con ese origen.
 *  3. Los dominios del negocio, precargados abajo → pasan.
 *  4. Lo que agregue `PRINT_AGENT_ALLOWED_ORIGINS` (separado por comas) → pasa.
 *     SUMA a los de arriba, nunca los reemplaza: así una variable mal escrita
 *     no puede dejar al mostrador sin imprimir.
 */

/**
 * Orígenes del negocio. Van en el código y no en una variable de entorno a
 * propósito: si dependieran de la config, olvidarla en la PC del mostrador
 * dejaría la caja sin imprimir. Son los de URLS-Y-ACCESOS.md.
 */
const ORIGENES_DEL_NEGOCIO = [
  'https://admin.tercos.co',
  'https://pos-tercos-admin-git-main-cristianvelezq1551s-projects.vercel.app',
];

/** Normaliza para comparar: sin espacios, sin barra final, en minúsculas. */
function normalizarOrigen(raw: string): string {
  return raw.trim().replace(/\/+$/, '').toLowerCase();
}

export function allowedOrigins(env: NodeJS.ProcessEnv): string[] {
  const extra = (env.PRINT_AGENT_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(normalizarOrigen)
    .filter(Boolean);
  return [...ORIGENES_DEL_NEGOCIO.map(normalizarOrigen), ...extra];
}

/** ¿El origen es la propia máquina? (cualquier puerto: dev usa varios) */
function esLoopback(origen: string): boolean {
  try {
    const u = new URL(origen);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return (LOOPBACK_HOSTS as readonly string[]).includes(u.hostname) || u.hostname === '[::1]';
  } catch {
    // `Origin: null` (iframe aislado, data:) llega acá: no es una URL y no pasa.
    return false;
  }
}

/**
 * ¿Este origen puede disparar una impresión o abrir el cajón?
 * Solo se aplica a los POST: los GET (`/health`, `/printers`) no tienen efecto
 * físico y siguen abiertos, para no romper diagnóstico ni la pantalla de
 * configuración de impresoras.
 */
export function originOk(origin: string | string[] | undefined, allowed: string[]): boolean {
  if (origin === undefined) return true;
  const valor = Array.isArray(origin) ? origin[0] : origin;
  if (valor === undefined || valor === '') return true;
  const limpio = normalizarOrigen(valor);
  if (esLoopback(limpio)) return true;
  return allowed.includes(limpio);
}
