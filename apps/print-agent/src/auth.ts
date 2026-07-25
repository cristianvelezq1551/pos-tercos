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
export function resolveHost(
  sharedSecret: string | null,
  explicitHost?: string,
): string {
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
