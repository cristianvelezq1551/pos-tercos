'use client';

import type { ProductAvailability } from '@pos-tercos/types';
import { useCallback, useEffect, useState } from 'react';
import { fetchAvailability } from '../api';

const POLL_MS = 20_000;

export interface AvailabilityMap {
  /** productId → disponibilidad. Ausente = sin dato (se asume disponible). */
  byId: Map<string, ProductAvailability>;
  refresh: () => Promise<void>;
}

/** Sondea la disponibilidad cada 20s y la expone como mapa por productId. */
export function useAvailability(): AvailabilityMap {
  const [byId, setById] = useState<Map<string, ProductAvailability>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchAvailability();
      setById(new Map(rows.map((r) => [r.productId, r])));
    } catch {
      // Silencioso: si el poll falla, mantenemos el último estado conocido.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { byId, refresh };
}
