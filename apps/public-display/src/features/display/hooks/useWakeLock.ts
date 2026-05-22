'use client';

import { useEffect } from 'react';

/** Subset mínimo de la Wake Lock API (evita depender de lib.dom). */
interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/**
 * Mantiene la pantalla encendida (kiosko todo el día). El sentinel se libera
 * cuando la pestaña va a background; lo re-pedimos al volver a `visible`.
 * Best-effort: si el browser/SO no soporta Wake Lock, no rompe nada (la
 * defensa real es la config de "no apagar pantalla" del SO de la tablet).
 */
export function useWakeLock() {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike })
      .wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let released = false;

    const request = async () => {
      try {
        sentinel = await wakeLock.request('screen');
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        // sin permiso / no soportado — best-effort
      }
    };

    const onVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        sentinel === null &&
        !released
      ) {
        void request();
      }
    };

    void request();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}
