/**
 * Saca "lat,lng" de un link de Google Maps.
 *
 * El dueño pega el link que le da la app ("Compartir") y ese link corto no
 * lleva coordenadas — hay que seguir el redirect para verlas. Con las
 * coordenadas alimentamos el mapa embebido y el deeplink de Waze, así el dueño
 * pega UNA cosa en vez de tres.
 *
 * Solo se sale a la red contra hosts de Google (whitelist): el link viene de un
 * input y sin eso el server haría requests a donde le digan (SSRF).
 */

const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'google.com',
  'www.google.com',
]);

/** `@lat,lng` del path (link largo) o `!3dLAT!4dLNG` (data del place). */
const PATH_COORDS = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/;
const PLACE_COORDS = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/;

const RESOLVE_TIMEOUT_MS = 5_000;

function extractCoords(url: string): string | null {
  // El del place es más preciso (el pin real); `@` es el centro del mapa.
  const match = PLACE_COORDS.exec(url) ?? PATH_COORDS.exec(url);
  return match ? `${match[1]},${match[2]}` : null;
}

/**
 * null si no se pudo deducir — nunca lanza: el dueño puede cargar las
 * coordenadas a mano y guardar el link igual.
 */
export async function resolveMapsCoords(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // El host se valida ANTES de mirar nada: acota el fetch (SSRF) y además evita
  // tomar por buenas unas coordenadas de un link que no es de Maps — un
  // `https://loquesea.com/p@1.0,2.0` dejaría el pin en medio del mar.
  if (!isAllowedHost(trimmed)) return null;

  // Link largo: las coordenadas ya vienen en la URL, sin salir a la red.
  const fromUrl = extractCoords(trimmed);
  if (fromUrl) return fromUrl;

  // HEAD alcanza: solo interesa la URL final del redirect, no el cuerpo.
  const res = await fetch(trimmed, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
  }).catch(() => null);
  if (!res) return null;

  // El allowlist de arriba solo cubre el PRIMER salto. Un acortador que
  // redirija fuera de Google terminaría entregándonos la URL de otro host, y
  // de ahí sacaríamos coordenadas en las que no confiamos. Revalidar el
  // destino final cierra el redirect como vector.
  if (!isAllowedHost(res.url)) return null;

  return extractCoords(res.url);
}

function isAllowedHost(url: string): boolean {
  try {
    return ALLOWED_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
