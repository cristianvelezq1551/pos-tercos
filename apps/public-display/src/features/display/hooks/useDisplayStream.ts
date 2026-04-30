'use client';

import {
  PublicDisplayStateSchema,
  type PublicDisplayState,
} from '@pos-tercos/types';
import { useEffect, useState } from 'react';

const API_PUBLIC_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type StreamConnection = 'connecting' | 'live' | 'reconnecting';

/**
 * Conecta al SSE público y refresca el state. EventSource hace reconnect
 * automático con backoff exponencial nativo del browser. Cuando ocurre un
 * `error`, el browser pasa a estado CONNECTING y reintenta solo.
 */
export function useDisplayStream(initial: PublicDisplayState) {
  const [state, setState] = useState<PublicDisplayState>(initial);
  const [connection, setConnection] = useState<StreamConnection>('connecting');

  useEffect(() => {
    setState(initial);
  }, [initial]);

  useEffect(() => {
    const url = `${API_PUBLIC_URL}/public-display/stream`;
    const es = new EventSource(url);

    es.onopen = () => setConnection('live');
    es.onmessage = (ev: MessageEvent<string>) => {
      try {
        const parsed = PublicDisplayStateSchema.safeParse(JSON.parse(ev.data));
        if (parsed.success) setState(parsed.data);
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => {
      // EventSource maneja reconnect solo. Solo reflejamos UI.
      setConnection('reconnecting');
    };

    return () => es.close();
  }, []);

  return { state, connection };
}
