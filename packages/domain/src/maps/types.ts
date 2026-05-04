/**
 * Coordenadas geográficas (lat/lng decimal). Convención WGS84.
 *  - lat: [-90, 90]
 *  - lng: [-180, 180]
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Resultado del geocoding directo: dirección que el cliente escribió +
 * coordenadas resueltas + dirección formateada por el provider.
 *
 * `accuracy` indica qué tan preciso es el match:
 *  - 'address': punto exacto de calle + número.
 *  - 'street': sólo calle (sin número confiable).
 *  - 'neighborhood' o lower: ambiguo; UI debería forzar al cliente a
 *    refinar antes de aceptar el pedido.
 */
export interface GeocodeResult {
  point: GeoPoint;
  formattedAddress: string;
  accuracy: 'address' | 'street' | 'neighborhood' | 'low';
}

export interface MapsProvider {
  readonly name: string;
  /** Dirección en texto → `GeocodeResult`. Lanza si no hay matches. */
  geocode(query: string): Promise<GeocodeResult>;
  /** Coords → dirección formateada. */
  reverseGeocode(point: GeoPoint): Promise<string>;
}
