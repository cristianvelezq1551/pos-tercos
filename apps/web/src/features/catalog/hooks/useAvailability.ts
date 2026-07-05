'use client';

import { type ProductAvailability } from '@pos-tercos/types';
import { useCallback, useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { fetchAvailability } from '../api/client';

// El cliente web es menos crítico que el cajero; 30s es suficiente para que un
// producto agotado se invalide sin martillar el backend con muchos clientes.
const POLL_MS = 30_000;

/** Sondea la disponibilidad pública y la expone como mapa por productId. */
export function useAvailability(): Map<string, ProductAvailability> {
  const [byId, setById] = useState<Map<string, ProductAvailability>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchAvailability();
      if (rows) setById(new Map(rows.map((r) => [r.productId, r])));
    } catch (e) {
      // Mantenemos el último estado conocido, pero dejamos rastro para diagnosticar.
      logError('availability', e);
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
