/**
 * Distancia geográfica — pura, sin IO ni proveedores externos.
 *
 * Fórmula de Haversine: distancia sobre la esfera. Para radios de unos pocos km
 * el error frente a un elipsoide es de metros — irrelevante para decidir si un
 * pedido entra en la zona de cobertura.
 *
 * ⚠️ Es distancia EN LÍNEA RECTA, no de recorrido. Un cliente a 9 km en línea
 * recta puede estar a 14 km de manejo si hay un río o una loma en el medio. El
 * radio se define sabiendo eso; calcular ruta real exigiría un proveedor pago.
 */

const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distancia en km entre dos puntos. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Parsea "lat,lng" (el formato en que se guardan las coordenadas del local).
 * null si no es un par válido — nunca lanza: una config a medias no puede
 * tumbar el checkout.
 */
export function parseLatLng(raw: string | null | undefined): LatLng | null {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]!.trim());
  const lng = Number(parts[1]!.trim());
  if (!isValidLatLng(lat, lng)) return null;
  return { lat, lng };
}

/** Rango físico válido. Descarta NaN, Infinity y coordenadas imposibles. */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
