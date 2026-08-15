import { Logger } from '@nestjs/common';
import type {
  AddressProvider,
  AddressSuggestion,
  ResolvedAddress,
} from '@pos-tercos/domain';

/**
 * Dev y tests, sin llave de Google y sin gastar cuota.
 *
 * Inventa coordenadas DETERMINÍSTICAS alrededor del local a partir del texto:
 * la misma dirección siempre cae en el mismo punto, así que un test puede
 * afirmar "esta dirección está dentro y esta otra afuera" sin depender de la
 * red. No pretende parecerse a Medellín — pretende ser reproducible.
 *
 * Convención para escribir tests: si el texto contiene "lejos", la dirección
 * cae fuera de cualquier radio razonable (~50 km). Cualquier otra queda a
 * menos de 1 km del local.
 */
export class StubAddressAdapter implements AddressProvider {
  private readonly logger = new Logger(StubAddressAdapter.name);

  constructor(private readonly getOrigin: () => Promise<{ lat: number; lng: number }>) {}

  async suggest(query: string): Promise<AddressSuggestion[]> {
    const q = query.trim();
    if (q.length < 4) return [];
    this.logger.debug(`[STUB direcciones] "${q}"`);
    // El id lleva el texto adentro: `resolve` no necesita estado compartido.
    return [1, 2].map((n) => ({
      id: `stub:${encodeURIComponent(q)}:${n}`,
      description: `${q} #${n}0-${n}0, Medellín`,
    }));
  }

  async resolve(suggestionId: string): Promise<ResolvedAddress | null> {
    if (!suggestionId.startsWith('stub:')) return null;
    const parts = suggestionId.split(':');
    const text = decodeURIComponent(parts[1] ?? '');
    const n = Number(parts[2] ?? '1');

    const lejos = text.toLowerCase().includes('lejos');
    // ~0.0045° ≈ 500 m. Con "lejos" nos vamos a ~0.45° ≈ 50 km.
    const delta = lejos ? 0.45 : 0.0045 * n;

    const origin = await this.getOrigin();
    return {
      formatted: `${text} #${n}0-${n}0, Medellín`,
      lat: origin.lat + delta,
      lng: origin.lng,
      precision: lejos ? 'approximate' : 'exact',
    };
  }
}
