'use client';

import type { GeocodeResponse } from '@pos-tercos/types';
import { Input, Label } from '@pos-tercos/ui';
import { useEffect, useRef, useState } from 'react';
import { geocodeAddress } from '../api/geocode';

const DEBOUNCE_MS = 700;
const MIN_QUERY_LENGTH = 6;

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Avisa al padre del último resultado geocode (o null si pendiente/error). */
  onGeocode: (result: GeocodeResponse | null) => void;
  /** Llamado cuando el usuario clickea "Cambiar a pickup" del banner fuera de zona. */
  onSwitchToPickup: () => void;
  disabled?: boolean;
}

type State =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; result: GeocodeResponse }
  | { kind: 'error'; message: string };

/**
 * Input de dirección con debounced geocode contra /api/web/geocode.
 * Muestra:
 *  - badge "Buscando…" mientras pending.
 *  - banner verde con dirección formateada + distanceKm cuando OK + within zona.
 *  - banner amber + CTA "Cambiar a pickup" cuando OK pero fuera de zona.
 *  - banner rojo si geocode falló.
 *
 * No tira al backend principal — solo informa al padre vía onGeocode().
 */
export function DeliveryAddressInput({
  value,
  onChange,
  onGeocode,
  onSwitchToPickup,
  disabled,
}: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTokenRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setState({ kind: 'idle' });
      onGeocode(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const myToken = ++cancelTokenRef.current;
      setState({ kind: 'pending' });
      onGeocode(null);
      try {
        const result = await geocodeAddress(value.trim());
        if (myToken !== cancelTokenRef.current) return; // stale
        setState({ kind: 'success', result });
        onGeocode(result);
      } catch (err) {
        if (myToken !== cancelTokenRef.current) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'No se pudo validar la dirección',
        });
        onGeocode(null);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, onGeocode]);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="address">Dirección de entrega</Label>
      <Input
        id="address"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Carrera 11 # 23-45, apto 302"
        maxLength={500}
        disabled={disabled}
        required
        autoComplete="street-address"
      />

      {state.kind === 'pending' ? (
        <p className="text-xs text-muted-foreground">📍 Buscando dirección…</p>
      ) : null}

      {state.kind === 'error' ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
          ⚠ {state.message}. Probá con calle + número + ciudad.
        </p>
      ) : null}

      {state.kind === 'success' && state.result.withinDeliveryRadius ? (
        <div className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-xs text-success-foreground">
          ✓ <strong>Dirección encontrada</strong> a {state.result.distanceKm} km del local.
          <br />
          <span className="opacity-80">{state.result.formattedAddress}</span>
        </div>
      ) : null}

      {state.kind === 'success' && !state.result.withinDeliveryRadius ? (
        <div className="rounded-md border border-warning-border bg-warning-bg px-3 py-3 text-xs text-warning-foreground">
          <p className="font-semibold">📍 Fuera de la zona de delivery</p>
          <p className="mt-1">
            Tu dirección está a <strong>{state.result.distanceKm} km</strong> del local.
            Solo entregamos en el radio de 3 km.
          </p>
          <button
            type="button"
            onClick={onSwitchToPickup}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-full border border-warning-border bg-warning/20 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-warning/30"
          >
            Cambiar a recoger en tienda
          </button>
        </div>
      ) : null}

      {state.kind === 'idle' && value.trim().length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Escribe calle + número + ciudad para validar la cobertura.
        </p>
      ) : null}
    </div>
  );
}
