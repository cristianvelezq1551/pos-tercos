import { Logger } from '@nestjs/common';
import type {
  AddressPrecision,
  AddressProvider,
  AddressSuggestion,
  ResolvedAddress,
} from '@pos-tercos/domain';

/** Un autocompletado que tarda más que esto ya no sirve: el cliente siguió escribiendo. */
const TIMEOUT_MS = 4_000;

const PLACES_BASE = 'https://places.googleapis.com/v1';

export interface AddressBias {
  lat: number;
  lng: number;
  radiusM: number;
}

/**
 * Google Places (New). Dos llamadas:
 *  - `places:autocomplete` mientras el cliente escribe.
 *  - `places/{id}` para las coordenadas de la que eligió.
 *
 * Va SIEMPRE por el server, nunca desde el navegador: la llave es de
 * facturación y publicarla es abrir la puerta a que un tercero gaste la cuota.
 *
 * Sesgado a Colombia (`regionCode: 'co'`) y al rededor del local, porque una
 * búsqueda de "calle 10" sin contexto trae medio continente.
 *
 * Nunca lanza por "no encontré": devuelve [] o null. Sí lanza si la llave está
 * mal o Google contesta error — eso es un problema de configuración y hay que
 * verlo, no tragarlo.
 */
export class GoogleAddressAdapter implements AddressProvider {
  private readonly logger = new Logger(GoogleAddressAdapter.name);
  private readonly apiKey: string;
  /** El local puede mudarse o cargarse después: el sesgo se lee en cada búsqueda. */
  private readonly getBias: () => Promise<AddressBias | null>;

  constructor(opts: { apiKey: string; getBias: () => Promise<AddressBias | null> }) {
    this.apiKey = opts.apiKey;
    this.getBias = opts.getBias;
  }

  async suggest(query: string, sessionToken?: string): Promise<AddressSuggestion[]> {
    const q = query.trim();
    // Menos de 4 caracteres no identifica nada y cada request se paga.
    if (q.length < 4) return [];

    const body: Record<string, unknown> = {
      input: q,
      regionCode: 'co',
      languageCode: 'es',
      // Solo direcciones: sin esto sugiere negocios y el cliente termina
      // eligiendo "Éxito Poblado" como su casa.
      includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
    };
    if (sessionToken) body.sessionToken = sessionToken;
    const bias = await this.getBias();
    if (bias) {
      body.locationBias = {
        circle: {
          center: { latitude: bias.lat, longitude: bias.lng },
          radius: bias.radiusM,
        },
      };
    }

    const json = await this.post<{
      suggestions?: {
        placePrediction?: { placeId?: string; text?: { text?: string } };
      }[];
    }>('/places:autocomplete', body, 'suggestions.placePrediction.placeId,suggestions.placePrediction.text');

    return (json?.suggestions ?? [])
      .map((s) => ({
        id: s.placePrediction?.placeId ?? '',
        description: s.placePrediction?.text?.text ?? '',
      }))
      .filter((s) => s.id && s.description);
  }

  async resolve(suggestionId: string, sessionToken?: string): Promise<ResolvedAddress | null> {
    const params = new URLSearchParams();
    if (sessionToken) params.set('sessionToken', sessionToken);
    const qs = params.toString();

    const json = await this.get<{
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      types?: string[];
    }>(
      `/places/${encodeURIComponent(suggestionId)}${qs ? `?${qs}` : ''}`,
      'formattedAddress,location,types',
    );

    const lat = json?.location?.latitude;
    const lng = json?.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    return {
      formatted: json?.formattedAddress ?? '',
      lat,
      lng,
      precision: precisionOf(json?.types ?? []),
    };
  }

  private async post<T>(path: string, body: unknown, fieldMask: string): Promise<T | null> {
    return this.call<T>(path, fieldMask, { method: 'POST', body: JSON.stringify(body) });
  }

  private async get<T>(path: string, fieldMask: string): Promise<T | null> {
    return this.call<T>(path, fieldMask, { method: 'GET' });
  }

  private async call<T>(path: string, fieldMask: string, init: RequestInit): Promise<T | null> {
    const res = await fetch(`${PLACES_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        // Sin FieldMask, Places (New) responde 400. Además acota lo que se paga.
        'X-Goog-FieldMask': fieldMask,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Places ${path} → HTTP ${res.status}: ${detail.slice(0, 300)}`);
      throw new Error(`Places HTTP ${res.status}`);
    }
    return (await res.json().catch(() => null)) as T | null;
  }
}

/**
 * De los `types` de Google a nuestra escala. `subpremise`/`premise` son un
 * punto concreto; `route` es "en algún lugar de esta calle", que a 3 km puede
 * ser la diferencia entre entrar y no.
 */
function precisionOf(types: string[]): AddressPrecision {
  if (types.includes('subpremise') || types.includes('premise') || types.includes('street_address')) {
    return 'exact';
  }
  if (types.includes('route') || types.includes('intersection')) return 'interpolated';
  return 'approximate';
}
