'use client';

import {
  ProductAvailabilityResponseSchema,
  type ProductAvailability,
} from '@pos-tercos/types';
import { useCallback, useEffect, useState } from 'react';

// El cliente web es menos crítico que el cajero; 30s es suficiente para que un
// producto agotado se invalide sin martillar el backend con muchos clientes.
const POLL_MS = 30_000;

/** Sondea la disponibilidad pública y la expone como mapa por productId. */
export function useAvailability(): Map<string, ProductAvailability> {
  const [byId, setById] = useState<Map<string, ProductAvailability>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/products/availability', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as unknown;
      const parsed = ProductAvailabilityResponseSchema.safeParse(json);
      if (parsed.success) {
        setById(new Map(parsed.data.map((r) => [r.productId, r])));
      }
    } catch {
      // Silencioso: mantenemos el último estado conocido.
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

  return byId;
}
