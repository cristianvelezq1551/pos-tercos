'use client';

import { ConnectionDot } from '@pos-tercos/ui';
import { useEffect, useRef, useState } from 'react';
import type { StreamConnection } from '../hooks/useDisplayStream';

const STALE_THRESHOLD_MS = 30_000;
const POLL_MS = 5_000;

/**
 * Mapeo a estados visuales del ConnectionDot. NUNCA `error` (rojo) — el
 * cliente no debe ver alarma. Cualquier hiccup queda en amber (warning).
 */
const STATE_MAP: Record<StreamConnection, 'connecting' | 'live'> = {
  connecting: 'connecting',
  live: 'live',
  reconnecting: 'connecting',
};

export function ConnectionIndicator({
  connection,
}: {
  connection: StreamConnection;
}) {
  const [stale, setStale] = useState(false);
  const sinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (connection === 'reconnecting') {
      if (sinceRef.current === null) sinceRef.current = Date.now();
    } else {
      sinceRef.current = null;
      setStale(false);
    }
  }, [connection]);

  useEffect(() => {
    if (connection !== 'reconnecting') return;
    const id = setInterval(() => {
      if (
        sinceRef.current !== null &&
        Date.now() - sinceRef.current >= STALE_THRESHOLD_MS
      ) {
        setStale(true);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [connection]);

  if (stale) {
    return (
      <div className="pointer-events-none absolute bottom-5 left-6 flex items-center gap-3 rounded-full border border-border bg-card/80 px-5 py-2 text-base text-muted-foreground shadow-md backdrop-blur-sm">
        <ConnectionDot state="connecting" size="md" />
        <span className="caps font-semibold tracking-[0.3em]">
          Actualizando…
        </span>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute bottom-4 right-6 opacity-40">
      <ConnectionDot state={STATE_MAP[connection]} size="sm" />
    </div>
  );
}
