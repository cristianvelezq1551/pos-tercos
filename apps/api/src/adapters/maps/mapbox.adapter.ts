import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  GeoPoint,
  GeocodeResult,
  MapsProvider,
} from '@pos-tercos/domain';

const BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const COUNTRY = 'co'; // Colombia
const LANGUAGE = 'es';
const LIMIT = 1;

interface MapboxFeature {
  center: [number, number]; // [lng, lat]
  place_name: string;
  place_type?: string[];
  relevance?: number;
}

@Injectable()
export class MapboxMapsAdapter implements MapsProvider {
  readonly name = 'mapbox';
  private readonly logger = new Logger(MapboxMapsAdapter.name);
  private readonly token: string;

  constructor() {
    const t = process.env.MAPBOX_SECRET_TOKEN;
    if (!t) throw new Error('MAPBOX_SECRET_TOKEN not set');
    this.token = t;
  }

  async geocode(query: string): Promise<GeocodeResult> {
    const url = `${BASE_URL}/${encodeURIComponent(query)}.json?access_token=${this.token}&country=${COUNTRY}&language=${LANGUAGE}&limit=${LIMIT}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`Mapbox geocode HTTP ${res.status} for "${query}"`);
      throw new BadRequestException('Geocoding service unavailable');
    }
    const json = (await res.json()) as { features: MapboxFeature[] };
    const feature = json.features[0];
    if (!feature) {
      throw new BadRequestException(`No se encontró la dirección "${query}"`);
    }
    return {
      point: { lat: feature.center[1], lng: feature.center[0] },
      formattedAddress: feature.place_name,
      accuracy: featureAccuracy(feature),
    };
  }

  async reverseGeocode(point: GeoPoint): Promise<string> {
    const url = `${BASE_URL}/${point.lng},${point.lat}.json?access_token=${this.token}&country=${COUNTRY}&language=${LANGUAGE}&limit=${LIMIT}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`Mapbox reverse HTTP ${res.status} for ${point.lat},${point.lng}`);
      throw new BadRequestException('Reverse geocoding service unavailable');
    }
    const json = (await res.json()) as { features: MapboxFeature[] };
    return json.features[0]?.place_name ?? `${point.lat},${point.lng}`;
  }
}

function featureAccuracy(f: MapboxFeature): GeocodeResult['accuracy'] {
  const types = f.place_type ?? [];
  if (types.includes('address')) return 'address';
  if (types.includes('street')) return 'street';
  if (types.includes('neighborhood') || types.includes('locality')) {
    return 'neighborhood';
  }
  return 'low';
}
