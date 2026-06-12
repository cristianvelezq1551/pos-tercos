'use client';

import { useEffect, useRef } from 'react';

/**
 * Polling consciente de visibilidad: ejecuta `fn` cada `intervalMs` SOLO
 * mientras la pestaña está visible, y dispara un refresh inmediato al volver
 * al frente. Evita martillar el backend desde pestañas en background (el POS
 * acumulaba ~48 req/min con la pestaña oculta).
 *
 * - `enabled: false` apaga todo (útil para modales cerrados).
 * - `fn` se lee de una ref: no hace falta memoizarla en el caller.
 * - Nunca solapa ejecuciones: si una corrida sigue en vuelo, el tick se salta.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  { enabled = true, immediate = true }: { enabled?: boolean; immediate?: boolean } = {},
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let inFlight = false;

    const run = () => {
      if (disposed || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      void Promise.resolve(fnRef.current()).finally(() => {
        inFlight = false;
      });
    };

    if (immediate) run();
    const id = setInterval(run, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled, immediate]);
}
