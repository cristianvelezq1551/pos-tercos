'use client';

import { useEffect } from 'react';

type Ctx = AudioContext | null;
let singleton: Ctx = null;
let primed = false;

function ensureCtx(): Ctx {
  if (typeof window === 'undefined') return null;
  if (singleton) return singleton;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    singleton = new Ctor();
  } catch {
    singleton = null;
  }
  return singleton;
}

/**
 * Devuelve el AudioContext compartido. Si está suspended, intenta resumirlo.
 * Es seguro llamarlo varias veces — siempre devuelve el mismo contexto.
 */
export function getAudioContext(): Ctx {
  const ctx = ensureCtx();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

/** Estado actual del context, útil para el panel de debug. */
export function getAudioContextState(): {
  available: boolean;
  state: AudioContextState | 'unavailable';
  primed: boolean;
} {
  const ctx = ensureCtx();
  return {
    available: ctx !== null,
    state: ctx ? ctx.state : 'unavailable',
    primed,
  };
}

/**
 * Hook que mantiene vivo el AudioContext y lo desbloquea en cualquier
 * interaction (pointer/touch/key) y al volver de background. Crítico para
 * TVs/Chromecasts que arrancan el AudioContext en estado `suspended`.
 */
export function useAudioContext() {
  useEffect(() => {
    const ctx = ensureCtx();
    if (!ctx) return;

    const unlock = () => {
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
      // El primer "unlock" exitoso queda registrado para el debug panel.
      if (ctx.state === 'running') primed = true;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') unlock();
    };

    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('touchstart', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    window.addEventListener('click', unlock, { once: false });
    document.addEventListener('visibilitychange', onVisibility);

    // Intento inmediato — en muchos TVs corre sin gesture.
    unlock();

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('click', unlock);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
