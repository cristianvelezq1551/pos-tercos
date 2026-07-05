'use client';

import { useEffect, useState } from 'react';
import { getAudioContext, getAudioContextState } from '../hooks/useAudioContext';

/**
 * Píldora no intrusiva (esquina) que aparece SOLO si el AudioContext está
 * bloqueado (autoplay policy del browser/kiosko). Un toque lo desbloquea para
 * toda la sesión → la música ambiente vuelve a sonar. Si el audio ya está
 * `running`, no se muestra nada.
 */
export function SoundActivationPill() {
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    const check = () => {
      const s = getAudioContextState();
      setSuspended(s.available && s.state !== 'running');
    };
    check();
    const id = setInterval(check, 1500);
    return () => clearInterval(id);
  }, []);

  if (!suspended) return null;

  const activate = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume().catch(() => undefined);
    // Beep corto de confirmación (también ayuda a "calentar" el contexto).
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.2, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.42);
    } catch {
      // ignore
    }
    setSuspended(false);
  };

  return (
    <button
      type="button"
      onClick={activate}
      className="fixed bottom-4 left-4 z-[160] flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md ring-1 ring-white/20 transition-colors hover:bg-white/20"
    >
      <span aria-hidden className="text-base">🔊</span>
      Activar sonido
    </button>
  );
}
