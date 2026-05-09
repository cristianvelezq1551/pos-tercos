'use client';

import { useEffect, useRef, useState } from 'react';

const HEARTBEAT_MS = 5_000;
const FREEZE_THRESHOLD_MS = 120_000;
const CHECK_MS = 10_000;

/**
 * Heartbeat de auto-recovery. Si los renders de React quedan freeze >120 s
 * (memory leak, exception loop, etc.), recarga la página. No detecta un
 * freeze duro del JS engine — eso lo maneja el browser con "Page Unresponsive".
 */
export function useStreamWatchdog() {
  const [, setBeat] = useState(0);
  const lastRenderRef = useRef(Date.now());

  // Marca el momento de cada render real.
  useEffect(() => {
    lastRenderRef.current = Date.now();
  });

  // Pulsa state cada 5 s para forzar re-render.
  useEffect(() => {
    const id = setInterval(() => setBeat((b) => (b + 1) % 1_000_000), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  // Watchdog independiente: si no hay renders en > FREEZE_THRESHOLD_MS, reload.
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastRenderRef.current > FREEZE_THRESHOLD_MS) {
        window.location.reload();
      }
    }, CHECK_MS);
    return () => clearInterval(id);
  }, []);
}
