'use client';

import type { Shift, User } from '@pos-tercos/types';
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
import { useConnectivity } from '../hooks/useConnectivity';
import { cacheCatalog, cacheSession, cacheStockSnapshot } from '../lib/cache';
import { offlineDb, requestPersistentStorage } from '../lib/db';
import { drainOfflineQueue } from '../lib/sync-engine';
import type { ConnectivityStatus } from '../lib/types';
import { OfflineBanner } from './OfflineBanner';
import { OfflineReviewTray } from './OfflineReviewTray';

interface OfflineContextValue {
  status: ConnectivityStatus;
  /** Ventas offline en cola (queued + syncing + failed) — bloquean el cierre. */
  pending: number;
  /** Ventas que fallaron al sincronizar (subconjunto de pending) — a revisar. */
  failed: number;
  /** false = el navegador DENEGÓ almacenamiento persistente (cola en riesgo). */
  persistent: boolean | null;
  /** Relee los contadores de cola desde IndexedDB. */
  refreshPending: () => void;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

/** Estado offline (conexión + cola) para cualquier componente del POS. */
export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline debe usarse dentro de <OfflineProvider>');
  return ctx;
}

const PENDING_POLL_MS = 10_000;

/**
 * Capa offline del POS (B.0a). Detecta conexión, expone el estado por contexto,
 * muestra la banda de estado, pide almacenamiento persistente y mantiene fríos
 * los caches (sesión + catálogo) mientras hay red — para que B.0b/B.2 puedan
 * operar offline. Es ADITIVO: no altera el camino online.
 */
export function OfflineProvider({
  user,
  shift,
  children,
}: {
  user: User | null;
  shift: Shift | null;
  children: ReactNode;
}) {
  const status = useConnectivity();
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [persistent, setPersistent] = useState<boolean | null>(null);

  const refreshPending = useCallback((): void => {
    void offlineDb.countPending().then(setPending);
    void offlineDb.countFailed().then(setFailed);
  }, []);

  // Persistencia: si el navegador la deniega, la cola offline puede purgarse
  // bajo presión de disco — el banner lo hace visible al cajero.
  useEffect(() => {
    void requestPersistentStorage().then(setPersistent);
  }, []);
  usePolling(refreshPending, PENDING_POLL_MS);

  // Snapshot de la sesión cuando hay user (y al cambiar user/shift: apertura, etc.).
  useEffect(() => {
    if (user) void cacheSession(user, shift).catch(() => undefined);
  }, [user, shift]);

  // Al estar online (y al recuperar conexión): refrescar el catálogo cacheado y
  // VACIAR la cola de ventas offline contra el backend.
  useEffect(() => {
    if (status === 'online') {
      void cacheCatalog().catch(() => undefined);
      // Drenar la cola y, recién después, refrescar el snapshot de stock (con la
      // cola vacía el stock del backend ya refleja las ventas offline → el ledger
      // local arranca limpio para el próximo corte).
      void drainOfflineQueue(refreshPending)
        .catch(() => undefined)
        .then(() => cacheStockSnapshot().catch(() => undefined));
    }
  }, [status, refreshPending]);

  // Re-drain periódico mientras quede cola (cubre el backoff entre reintentos:
  // el drain del evento 'online' corre una vez; los reintentos espaciados
  // necesitan que alguien vuelva a llamar).
  usePolling(
    async () => {
      if (status === 'online' && pending > 0) {
        await drainOfflineQueue(refreshPending).catch(() => undefined);
      }
    },
    30_000,
    { enabled: status === 'online' && pending > 0, immediate: false },
  );

  // Memoizado: este provider envuelve todo el POS y re-renderiza en cada tick de
  // polling (10s). Sin memo, el value cambia de identidad y fuerza re-render de
  // todos los consumidores de useOffline() aunque su slice no haya cambiado.
  const value = useMemo(
    () => ({ status, pending, failed, persistent, refreshPending }),
    [status, pending, failed, persistent, refreshPending],
  );

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}

/** Banda de estado offline/sincronización + acceso a la bandeja de revisión.
 *  Colocala dentro del <OfflineProvider> (ej. arriba de la columna del layout). */
export function OfflineStatusBar() {
  const { status, pending, failed, persistent, refreshPending } = useOffline();
  const [trayOpen, setTrayOpen] = useState(false);
  return (
    <>
      <OfflineBanner
        status={status}
        pending={pending}
        failed={failed}
        persistent={persistent}
        onReview={() => setTrayOpen(true)}
      />
      <OfflineReviewTray
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        onChanged={refreshPending}
      />
    </>
  );
}
