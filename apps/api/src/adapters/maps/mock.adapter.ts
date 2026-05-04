import { Injectable, Logger } from '@nestjs/common';
import type {
  GeoPoint,
  GeocodeResult,
  MapsProvider,
} from '@pos-tercos/domain';

/**
 * Adapter mock para tests/CI sin token Mapbox. Determinístico:
 *  - Misma query → mismo resultado (hash → offset estable).
 *  - Centra todo cerca de RESTAURANT_LAT/LNG ± random offset acotado.
 *  - "calle 1" / "lejos" simulan fuera de zona (offset grande).
 */
@Injectable()
export class MockMapsAdapter implements MapsProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockMapsAdapter.name);
  private readonly origin: GeoPoint;

  constructor() {
    const lat = Number(process.env.RESTAURANT_LAT ?? '4.6533');
    const lng = Number(process.env.RESTAURANT_LNG ?? '-74.0836');
    this.origin = { lat, lng };
    this.logger.log(`Mock maps adapter active (origin ${lat},${lng})`);
  }

  async geocode(query: string): Promise<GeocodeResult> {
    // Convención de tests: querys que contengan "lejos" → fuera de zona (~5km).
    // Cualquier otra → dentro de zona (~0.5km offset estable).
    const lower = query.toLowerCase();
    const offsetKm = lower.includes('lejos') || lower.includes('far') ? 5 : 0.5;

    // Hash determinístico → ángulo
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      hash = (hash * 31 + query.charCodeAt(i)) | 0;
    }
    const angle = ((hash & 0xffff) / 0xffff) * 2 * Math.PI;
    const dLat = (offsetKm / 111) * Math.cos(angle);
    const dLng = (offsetKm / (111 * Math.cos(toRad(this.origin.lat)))) * Math.sin(angle);

    return {
      point: {
        lat: round6(this.origin.lat + dLat),
        lng: round6(this.origin.lng + dLng),
      },
      formattedAddress: `${query} (mock, ${offsetKm}km del local)`,
      accuracy: 'address',
    };
  }

  async reverseGeocode(point: GeoPoint): Promise<string> {
    return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)} (mock)`;
  }
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
