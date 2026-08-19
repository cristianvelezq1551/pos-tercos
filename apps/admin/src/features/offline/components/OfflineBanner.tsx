'use client';

import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';
import type { ConnectivityStatus } from '../lib/types';

/**
 * Banda de estado offline. Cuatro estados:
 *  - offline → ámbar "vendiendo offline (N en cola)".
 *  - online + fallidas → rojo "N sin sincronizar — Revisar" (abre la bandeja).
 *  - online + sincronizando → neutro "Sincronizando N…".
 *  - online sin cola → nada (operación normal).
 */
export function OfflineBanner({
  status,
  pending,
  failed,
  persistent = null,
  onReview,
}: {
  status: ConnectivityStatus;
  pending: number;
  failed: number;
  /** false = el navegador denegó almacenamiento persistente. */
  persistent?: boolean | null;
  onReview: () => void;
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
        {persistent === false ? (
          <span className="font-bold text-destructive">
            · ⚠ almacenamiento NO persistente: no cierres el navegador con ventas en cola
          </span>
        ) : null}
      </div>
    );
  }

  // Online: si quedaron fallidas tras sincronizar, avisar y ofrecer revisar.
  if (failed > 0) {
    return (
      <button
        type="button"
        onClick={onReview}
        className="flex w-full items-center justify-center gap-2 bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/25"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        {failed} venta{failed === 1 ? '' : 's'} sin sincronizar — Revisar
      </button>
    );
  }

  // Online: sincronizando (cola activa sin fallidas).
  if (pending > 0) {
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
