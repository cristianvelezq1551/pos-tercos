import type { GeoPoint } from './types';

const EARTH_RADIUS_KM = 6371.0088; // mean radius WGS84

/**
 * Distancia entre 2 puntos sobre la esfera terrestre, en kilómetros.
 * Función pura — sin IO, sin allocations innecesarias.
 *
 * Para distancias urbanas (<10km) la fórmula esférica es lo suficientemente
 * precisa (error <0.5%); no necesitamos Vincenty ni elipsoide.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Helper de conveniencia: ¿está `point` dentro del radio (km) desde `origin`?
 */
export function withinRadius(
  origin: GeoPoint,
  point: GeoPoint,
  radiusKm: number,
): boolean {
  return haversineKm(origin, point) <= radiusKm;
}
