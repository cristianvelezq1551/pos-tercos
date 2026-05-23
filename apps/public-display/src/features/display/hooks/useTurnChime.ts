'use client';

import { useEffect, useRef } from 'react';
import { getAudioContext } from './useAudioContext';

const THROTTLE_MS = 800;

let lastError: string | null = null;

export function getLastChimeError(): string | null {
  return lastError;
}

/**
 * Chime original que el usuario validó como cómodo: acorde de dos sines
 * (A5 880 Hz + E6 1318 Hz), offset 120 ms entre notas, gain peak 0.28,
 * decay exponencial 700 ms. Se siente como una "campanita" suave.
 */
function ringChime(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const tones: { freq: number; delay: number }[] = [
    { freq: 880, delay: 0 },
    { freq: 1318.5, delay: 0.12 },
  ];

  for (const { freq, delay } of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = now + delay;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.28, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.72);
  }
}

/**
 * Reproduce el chime con AudioContext. Si está suspended hace resume async
 * y reintenta. Si el contexto no llega a `running` (ej. TV sin gesture
 * previo), no suena y deja el motivo en `lastError` para el debug panel.
 */
async function announce(): Promise<void> {
  lastError = null;
  const ctx = getAudioContext();
  if (!ctx) {
    lastError = 'AudioContext no disponible';
    return;
  }
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  if (ctx.state !== 'running') {
    lastError = `AudioContext en estado "${ctx.state}"`;
    return;
  }
  try {
    ringChime(ctx);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Anuncia cada llamado (`trigger` = callSeq, monotónico). Suena también al
 * re-llamar el mismo número. Ignora el primer mount.
 * Throttle 800 ms para evitar doble play en doble click del cajero.
 */
export function useTurnChime(trigger: number) {
  const previousRef = useRef<number | null>(null);
  const lastPlayedRef = useRef<number>(0);

  useEffect(() => {
    if (previousRef.current === null) {
      previousRef.current = trigger;
      return;
    }
    if (previousRef.current === trigger) return;
    previousRef.current = trigger;

    const now = Date.now();
    if (now - lastPlayedRef.current < THROTTLE_MS) return;
    lastPlayedRef.current = now;

    void announce();
  }, [trigger]);
}
