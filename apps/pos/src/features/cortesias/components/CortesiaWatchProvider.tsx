'use client';

import type { CortesiaRequest } from '@pos-tercos/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePolling } from '../../../lib/use-polling';
import { isUnseenResolved, listMyCortesias } from '../api/client';
import { CORTESIA_ACTIVITY_EVENT } from '../lib/cortesia-events';

/** Una cortesía "en vuelo": pendiente de revisión o resuelta sin que el cajero la viera. */
function inFlight(c: CortesiaRequest): boolean {
  return c.status === 'PENDING' || isUnseenResolved(c);
}

interface CortesiaWatchValue {
  items: CortesiaRequest[];
  refresh: () => Promise<void>;
}

const CortesiaWatchContext = createContext<CortesiaWatchValue>({
  items: [],
  refresh: async () => {},
});

/**
 * Fuente ÚNICA de las cortesías del cajero. Hace UNA lectura al cargar (por si
 * algo se resolvió con el POS cerrado) y SOLO sigue pooleando mientras haya
 * algo "en vuelo" (pendiente o resuelto sin ver). En reposo no consume nada.
 * Se reactiva cuando el cajero registra una cortesía (evento de actividad).
 */
export function CortesiaWatchProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CortesiaRequest[]>([]);

  const refresh = useCallback(async () => {
    try {
      setItems(await listMyCortesias());
    } catch {
      // sin red: conservar lo último.
    }
  }, []);

  // Lectura inicial (una sola vez mientras el layout esté montado).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Al registrar una cortesía, refrescar → arranca el polling si queda en vuelo.
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener(CORTESIA_ACTIVITY_EVENT, handler);
    return () => window.removeEventListener(CORTESIA_ACTIVITY_EVENT, handler);
  }, [refresh]);

  const hasInFlight = items.some(inFlight);
  // Polling SOLO mientras haya algo en vuelo; al resolverse y acusarse, se apaga.
  usePolling(refresh, 12_000, { enabled: hasInFlight, immediate: false });

  // Memoizado: el provider re-renderiza en cada tick de polling (12s); sin memo
  // el value cambia de identidad y re-renderiza todos los consumidores.
  const value = useMemo(() => ({ items, refresh }), [items, refresh]);

  return (
    <CortesiaWatchContext.Provider value={value}>
      {children}
    </CortesiaWatchContext.Provider>
  );
}

export function useCortesiaWatch(): CortesiaWatchValue {
  return useContext(CortesiaWatchContext);
}
