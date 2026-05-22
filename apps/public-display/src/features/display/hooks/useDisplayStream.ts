'use client';

import {
  PublicDisplayStateSchema,
  type PublicDisplayState,
} from '@pos-tercos/types';
import { useEffect, useRef, useState } from 'react';

const API_PUBLIC_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const DEBOUNCE_MS = 200;
const STALE_AFTER_MS = 60_000;
const POLL_INTERVAL_MS = 30_000;
const RECONNECT_BACKOFF_MS = 3_000;

export type StreamConnection = 'connecting' | 'live' | 'reconnecting';

/**
 * Conecta al SSE público y refresca el state.
 *  - `initial` (SSR) SOLO siembra el estado inicial; después manda el SSE.
 *    No se re-sincroniza con `initial` para no revertir el turno en vivo.
 *  - Debounce 200 ms + dedupe por `currentTurn`: la pantalla solo re-renderiza
 *    cuando cambia el turno (evita parpadeo del carrusel ante notifies por venta).
 *  - Fallback poll: si el state quedó stale >60 s, refetchea `/state` cada 30 s.
 *  - Reconnect nativo del browser + recreación manual del EventSource si el
 *    browser lo cierra de forma permanente (ej. 502 en un redeploy).
 */
export function useDisplayStream(initial: PublicDisplayState) {
  const [state, setState] = useState<PublicDisplayState>(initial);
  const [connection, setConnection] = useState<StreamConnection>('connecting');
  const asOfRef = useRef(initial.asOf);

  useEffect(() => {
    let es: EventSource | null = null;
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingState: PublicDisplayState | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const flush = () => {
      if (pendingState) {
        const next = pendingState;
        asOfRef.current = next.asOf;
        // Solo re-render si cambió el turno visible.
        setState((prev) =>
          prev.currentTurn === next.currentTurn ? prev : next,
        );
      }
      pendingTimeout = null;
      pendingState = null;
    };

    const connect = () => {
      es = new EventSource(`${API_PUBLIC_URL}/public-display/stream`);
      es.onopen = () => setConnection('live');
      es.onmessage = (ev: MessageEvent<string>) => {
        try {
          const parsed = PublicDisplayStateSchema.safeParse(JSON.parse(ev.data));
          if (!parsed.success) return;
          pendingState = parsed.data;
          if (pendingTimeout !== null) clearTimeout(pendingTimeout);
          pendingTimeout = setTimeout(flush, DEBOUNCE_MS);
        } catch {
          // ignore malformed
        }
      };
      es.onerror = () => {
        setConnection('reconnecting');
        // EventSource CLOSED = el browser no reintentará solo. Lo recreamos.
        if (es && es.readyState === EventSource.CLOSED && !closed) {
          es.close();
          if (reconnectTimer === null) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connect();
            }, RECONNECT_BACKOFF_MS);
          }
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (pendingTimeout !== null) clearTimeout(pendingTimeout);
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);

  // Fallback poll cuando el state quedó stale (SSE silencioso).
  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      const ageMs = Date.now() - new Date(asOfRef.current).getTime();
      if (ageMs < STALE_AFTER_MS) return;
      try {
        const res = await fetch(`${API_PUBLIC_URL}/public-display/state`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json().catch(() => null)) as unknown;
        const parsed = PublicDisplayStateSchema.safeParse(json);
        if (parsed.success && !cancelled) {
          asOfRef.current = parsed.data.asOf;
          setState((prev) =>
            prev.currentTurn === parsed.data.currentTurn ? prev : parsed.data,
          );
        }
      } catch {
        // ignore — el SSE seguirá intentando reconectar
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { state, connection };
}
