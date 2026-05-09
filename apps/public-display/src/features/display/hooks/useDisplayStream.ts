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

export type StreamConnection = 'connecting' | 'live' | 'reconnecting';

/**
 * Conecta al SSE público y refresca el state.
 *  - Debounce 200 ms: si llegan varias updates seguidas, aplica solo la
 *    última al render. Evita re-renders innecesarios.
 *  - Fallback poll: si el state quedó stale >60 s (SSE caído sin que el
 *    browser reporte error todavía), refetchea `/public-display/state` cada
 *    30 s hasta volver a la frescura.
 *  - Reconnect del browser nativo via EventSource (backoff exponencial).
 */
export function useDisplayStream(initial: PublicDisplayState) {
  const [state, setState] = useState<PublicDisplayState>(initial);
  const [connection, setConnection] = useState<StreamConnection>('connecting');
  const asOfRef = useRef(initial.asOf);

  useEffect(() => {
    setState(initial);
    asOfRef.current = initial.asOf;
  }, [initial]);

  useEffect(() => {
    const url = `${API_PUBLIC_URL}/public-display/stream`;
    const es = new EventSource(url);
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingState: PublicDisplayState | null = null;

    const flush = () => {
      if (pendingState) {
        const next = pendingState;
        asOfRef.current = next.asOf;
        setState(next);
      }
      pendingTimeout = null;
      pendingState = null;
    };

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
    es.onerror = () => setConnection('reconnecting');

    return () => {
      if (pendingTimeout !== null) clearTimeout(pendingTimeout);
      es.close();
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
          setState(parsed.data);
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
