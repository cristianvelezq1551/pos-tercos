'use client';

import { useEffect, useState } from 'react';
import { getAudioContextState } from '../hooks/useAudioContext';

/**
 * Visible solo con `?debug=audio`. Muestra el estado del AudioContext.
 * Pensado para enchufar la URL en un TV específico y diagnosticar por qué
 * no suena la música ambiente.
 */
export function AudioDebugPanel() {
  const [enabled, setEnabled] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get('debug') === 'audio');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  const ctxState = getAudioContextState();
  const userAgent =
    typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a';

  return (
    <div
      className="fixed left-4 top-4 z-[300] max-w-sm rounded-lg border border-accent/40 bg-bg-card/95 p-4 font-mono text-xs leading-relaxed text-text-white shadow-2xl"
      data-tick={tick}
    >
      <div className="mb-2 text-accent font-bold">AUDIO DEBUG</div>
      <div>
        AudioCtx available: <b>{String(ctxState.available)}</b>
      </div>
      <div>
        AudioCtx state: <b>{ctxState.state}</b>
      </div>
      <div>
        Primed (post-gesture): <b>{String(ctxState.primed)}</b>
      </div>
      <div className="mt-2 break-all opacity-60">UA: {userAgent}</div>
    </div>
  );
}
