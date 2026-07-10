'use client';

import type { ProductAvailability } from '@pos-tercos/types';
import { useCallback, useState } from 'react';
import { computeOfflineAvailability } from '../../offline';
import { fetchAvailability } from '../api';
import { usePolling } from '../../../lib/use-polling';

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
      // Sin conexión: calcular desde el snapshot cacheado + ledger local (B.2.2)
      // → un preparado se marca agotado offline igual que online.
      try {
        const rows = await computeOfflineAvailability();
        if (rows.length > 0) setById(new Map(rows.map((r) => [r.productId, r])));
      } catch {
        // Sin snapshot cacheado: mantener el último estado conocido.
      }
    }
  }, []);

  usePolling(refresh, POLL_MS);

  return { byId, refresh };
}
