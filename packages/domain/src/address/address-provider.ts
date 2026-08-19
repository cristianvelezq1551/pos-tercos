/**
 * Puerto de búsqueda de direcciones. Lo implementa apps/api (Google Places /
 * stub de dev) — el domain no sabe de HTTP ni de llaves.
 *
 * Por qué existe: hasta ahora la dirección era texto libre y las coordenadas
 * venían del GPS del NAVEGADOR, o sea "dónde está el teléfono", no "a dónde va
 * la comida". Con eso, alguien que pide desde el trabajo para su casa se medía
 * desde el trabajo. La zona de cobertura se valida contra la dirección elegida,
 * y para eso la dirección tiene que traer sus propias coordenadas.
 */

/** Una opción del autocompletado, todavía sin coordenadas. */
export interface AddressSuggestion {
  /** Identificador opaco del proveedor; se canjea por coordenadas. */
  id: string;
  /** Lo que ve el cliente en la lista ("Cra 43A #5-15, Medellín"). */
  description: string;
}

/**
 * Precisión de la coordenada devuelta. Google no siempre da el punto exacto:
 * a veces interpola sobre el tramo de la calle o cae en el centro del barrio.
 * A 3 km de radio la diferencia decide si alguien entra o no, así que quien
 * consume esto decide qué precisión acepta.
 */
export type AddressPrecision = 'exact' | 'interpolated' | 'approximate';

export interface ResolvedAddress {
  /** Dirección normalizada por el proveedor. */
  formatted: string;
  lat: number;
  lng: number;
  precision: AddressPrecision;
}

export interface AddressProvider {
  /**
   * Sugerencias para lo que el cliente va escribiendo. Devuelve [] si la
   * consulta es muy corta o el proveedor no encontró nada — nunca lanza por
   * "no hay resultados".
   */
  suggest(query: string, sessionToken?: string): Promise<AddressSuggestion[]>;

  /** Coordenadas de una sugerencia. null si el id ya no es válido. */
  resolve(suggestionId: string, sessionToken?: string): Promise<ResolvedAddress | null>;
}
