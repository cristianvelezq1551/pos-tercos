'use client';

import type { Shift, User } from '@pos-tercos/types';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useConnectivity } from '../hooks/useConnectivity';
import { cacheCatalog, cacheSession } from '../lib/cache';
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

  const refreshPending = (): void => {
    void offlineDb.countPending().then(setPending);
    void offlineDb.countFailed().then(setFailed);
  };

  // Persistencia + 1er poll de cola (una vez).
  useEffect(() => {
    void requestPersistentStorage();
    refreshPending();
    const id = setInterval(refreshPending, PENDING_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Snapshot de la sesión cuando hay user (y al cambiar user/shift: apertura, etc.).
  useEffect(() => {
    if (user) void cacheSession(user, shift).catch(() => undefined);
  }, [user, shift]);

  // Al estar online (y al recuperar conexión): refrescar el catálogo cacheado y
  // VACIAR la cola de ventas offline contra el backend.
  useEffect(() => {
    if (status === 'online') {
      void cacheCatalog().catch(() => undefined);
      void drainOfflineQueue(refreshPending).catch(() => undefined);
    }
  }, [status]);

  return (
    <OfflineContext.Provider value={{ status, pending, failed, refreshPending }}>
      {children}
    </OfflineContext.Provider>
  );
}

/** Banda de estado offline/sincronización + acceso a la bandeja de revisión.
 *  Colocala dentro del <OfflineProvider> (ej. arriba de la columna del layout). */
export function OfflineStatusBar() {
  const { status, pending, failed, refreshPending } = useOffline();
  const [trayOpen, setTrayOpen] = useState(false);
  return (
    <>
      <OfflineBanner
        status={status}
        pending={pending}
        failed={failed}
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
