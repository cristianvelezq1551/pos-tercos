'use client';

import { haversineKm, parseLatLng } from '@pos-tercos/domain';
import { useCallback, useState } from 'react';
import { useBusiness } from '../store/business-store';

export type GeoStatus = 'idle' | 'asking' | 'ok' | 'denied' | 'unavailable';

export interface GeoResult {
  lat: number;
  lng: number;
  distanceKm: number | null;
  inRange: boolean;
}

const GEO_TIMEOUT_MS = 10_000;

/**
 * Ubicación del cliente por GPS del navegador, para la zona de cobertura.
 *
 * Lo que decide acá es solo la UX (avisar antes de llenar el formulario): la
 * autoridad es el server, que revalida al crear el pedido. Si el permiso se
 * niega o falla, NO se bloquea — decisión del dueño: el radio filtra, no es un
 * candado.
 */
export function useGeolocation() {
  const radius = useBusiness((s) => s.business.radius);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [result, setResult] = useState<GeoResult | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const origin = parseLatLng(radius.originCoords);
        const distanceKm = origin ? haversineKm(origin, { lat, lng }) : null;
        setResult({
          lat,
          lng,
          distanceKm,
          inRange: distanceKm === null ? true : distanceKm <= radius.radiusKm,
        });
        setStatus('ok');
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 60_000 },
    );
  }, [radius.originCoords, radius.radiusKm]);

  /** ¿Hay que pedirle la ubicación? Solo si el dueño lo prendió y hay origen. */
  const enabled = radius.ordersRespectRadius && Boolean(radius.originCoords);

  return { enabled, status, result, request, radiusKm: radius.radiusKm };
}
