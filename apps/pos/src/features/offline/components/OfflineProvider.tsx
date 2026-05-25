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
import type { ConnectivityStatus } from '../lib/types';
import { OfflineBanner } from './OfflineBanner';

interface OfflineContextValue {
  status: ConnectivityStatus;
  /** Ventas offline en cola (queued + syncing + failed). */
  pending: number;
  /** Relee el contador de cola desde IndexedDB. */
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

  const refreshPending = (): void => {
    void offlineDb.countPending().then(setPending);
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

  // Refrescar el catálogo cacheado al estar online (y al recuperar conexión).
  useEffect(() => {
    if (status === 'online') {
      void cacheCatalog().catch(() => undefined);
    }
  }, [status]);

  return (
    <OfflineContext.Provider value={{ status, pending, refreshPending }}>
      {children}
    </OfflineContext.Provider>
  );
}

/** Banda de estado offline/sincronización. Colocala donde quieras dentro del
 *  <OfflineProvider> (ej. arriba de la columna del layout). */
export function OfflineStatusBar() {
  const { status, pending } = useOffline();
  return <OfflineBanner status={status} pending={pending} />;
}
