import {
  AddressSuggestResponseSchema,
  ResolvedAddressSchema,
  type AddressSuggestion,
  type ResolvedAddressResponse,
} from '@pos-tercos/types';

/**
 * Búsqueda de direcciones. Pasa por nuestra API, no por Google directo: la
 * llave es de facturación y no puede vivir en el navegador.
 */
export async function suggestAddresses(
  query: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({ q: query, session: sessionToken });
  const res = await fetch(`/api/web/address/suggest?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return AddressSuggestResponseSchema.parse(await res.json()).suggestions;
}

/** Canjea la sugerencia por coordenadas firmadas + veredicto de cobertura. */
export async function resolveAddress(
  suggestionId: string,
  sessionToken: string,
): Promise<ResolvedAddressResponse> {
  const res = await fetch('/api/web/address/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestionId, sessionToken }),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return ResolvedAddressSchema.parse(await res.json());
}
