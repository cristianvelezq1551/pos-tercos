'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import type { ConnectivityStatus } from '../lib/types';

/**
 * Banda de estado offline. Ámbar cuando no hay conexión (se está vendiendo
 * offline); azul cuando volvió la red y aún quedan ventas por sincronizar.
 * No se muestra en operación normal (online, sin cola).
 */
export function OfflineBanner({
  status,
  pending,
}: {
  status: ConnectivityStatus;
  pending: number;
}) {
  if (status === 'offline') {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 bg-warning-bg px-3 py-1.5 text-xs font-semibold text-warning"
      >
        <CloudOff className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Sin conexión — vendiendo offline
        {pending > 0 ? <span className="font-bold">· {pending} en cola</span> : null}
      </div>
    );
  }

  if (status === 'online' && pending > 0) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
      >
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
        Sincronizando {pending} {pending === 1 ? 'venta' : 'ventas'}…
      </div>
    );
  }

  return null;
}
