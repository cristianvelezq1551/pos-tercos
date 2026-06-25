'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePolling } from '../../../lib/use-polling';
import { isUnseenObserved, listMyCortesias } from '../api/client';

/**
 * Cuenta de cortesías "Observadas" que el cajero aún no acusó. Alimenta el
 * badge del nav (avisa hasta que las marca vistas).
 */
export function useUnseenCortesias(): number {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const all = await listMyCortesias();
      setCount(all.filter(isUnseenObserved).length);
    } catch {
      // sin red / error: no romper el nav.
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePolling(refresh, 20_000, { enabled: true, immediate: false });
  return count;
}
