'use client';

import type { AddressSuggestion, ResolvedAddressResponse } from '@pos-tercos/types';
import { cn, FormField, Input } from '@pos-tercos/ui';
import { Check, Loader2, MapPin, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveAddress, suggestAddresses } from '../api/address';
import { randomUUID } from '../../../lib/uuid';

/** Se espera a que deje de escribir: cada búsqueda cuesta plata. */
const DEBOUNCE_MS = 350;

/**
 * Dirección de entrega con sugerencias reales.
 *
 * Por qué elegir de la lista y no escribir libre: la zona de cobertura se mide
 * contra la dirección, y para medirla hay que saber dónde queda. El texto
 * suelto no tiene coordenadas — antes se usaba el GPS del navegador, que dice
 * dónde está el teléfono y no a dónde va la comida.
 *
 * Lo que el cliente escribe DESPUÉS (torre, apto, portería) va en un campo
 * aparte: eso no se geocodifica y es justo lo que el repartidor necesita para
 * tocar un timbre.
 */
export function AddressAutocomplete({
  onResolved,
}: {
  /** null = todavía no hay una dirección válida elegida. */
  onResolved: (resolved: ResolvedAddressResponse | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<ResolvedAddressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Agrupa el tipeo + la elección en una sesión de facturación de Google. */
  const sessionRef = useRef(randomUUID());
  /** Ignora respuestas de búsquedas que el cliente ya dejó atrás. */
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (chosen || query.trim().length < 4) {
      setOptions([]);
      return;
    }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      suggestAddresses(query, sessionRef.current, ctrl.signal)
        .then(setOptions)
        .catch((e: unknown) => {
          if ((e as Error)?.name !== 'AbortError') setOptions([]);
        })
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, chosen]);

  const pick = useCallback(
    async (s: AddressSuggestion) => {
      setOptions([]);
      setQuery(s.description);
      setSearching(true);
      setError(null);
      try {
        const resolved = await resolveAddress(s.id, sessionRef.current);
        // Sesión consumida: la próxima búsqueda abre una nueva.
        sessionRef.current = randomUUID();
        if (!resolved.addressToken) {
          setError('No pudimos ubicar esa dirección. Prueba con otra de la lista.');
          setChosen(null);
          onResolved(null);
          return;
        }
        setChosen(resolved);
        // Fuera de zona igual se reporta hacia arriba: el formulario decide
        // (bloquea el envío) y acá se explica por qué.
        onResolved(resolved);
      } catch {
        setError('No pudimos verificar esa dirección. Intenta de nuevo.');
        setChosen(null);
        onResolved(null);
      } finally {
        setSearching(false);
      }
    },
    [onResolved],
  );

  const edit = (value: string) => {
    setQuery(value);
    if (chosen) {
      // Tocó una dirección ya confirmada: deja de estarlo hasta volver a elegir.
      setChosen(null);
      onResolved(null);
    }
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <FormField
        label="Dirección de entrega"
        hint="Empieza a escribir y elige tu dirección de la lista."
        required
      >
        <div className="relative">
          <Input
            value={query}
            onChange={(e) => edit(e.target.value)}
            placeholder="Cra 43A #5-15"
            autoComplete="off"
            maxLength={300}
            aria-label="Buscar dirección de entrega"
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      </FormField>

      {options.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => void pick(o)}
                className="flex w-full items-start gap-2 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                {o.description}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {chosen ? <Verdict resolved={chosen} /> : null}

      {error ? (
        <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          {error}
        </p>
      ) : null}

      {!chosen && !error && query.trim().length >= 4 && !searching && options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No encontramos esa dirección. Prueba escribiéndola de otra forma.
        </p>
      ) : null}
    </div>
  );
}

function Verdict({ resolved }: { resolved: ResolvedAddressResponse }) {
  if (!resolved.inRange) {
    return (
      <p
        className={cn(
          'flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive',
        )}
        role="alert"
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
        <span>
          {resolved.distanceKm !== null
            ? `Esa dirección está a ${resolved.distanceKm.toFixed(1)} km y llegamos hasta ${resolved.radiusKm} km.`
            : `Esa dirección queda fuera de nuestra zona (llegamos hasta ${resolved.radiusKm} km).`}{' '}
          Puedes pedir para recoger en el local.
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 text-sm text-emerald-500">
      <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
      <span>
        {resolved.formatted}
        {resolved.distanceKm !== null ? ` · a ${resolved.distanceKm.toFixed(1)} km` : ''}
        {/* Google a veces ubica sobre la calle y no en el portal. A 3 km de
            radio esa diferencia decide, así que se avisa en vez de fingir
            precisión que no hay. */}
        {resolved.precision !== 'exact' ? ' (ubicación aproximada)' : ''}
      </span>
    </p>
  );
}
