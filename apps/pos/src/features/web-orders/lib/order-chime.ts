'use client';

import { getAudioContext } from '../../../lib/audio';

/**
 * Beep corto para avisar al cajero que entró un pedido web. Web Audio API
 * (sin asset). El AudioContext se desbloquea con la primera interacción del
 * cajero (clicks del POS), así que para cuando entra un pedido ya suena.
 */

export function playWebOrderChime(): void {
  const c = getAudioContext();
  if (!c) return;
  const now = c.currentTime;
  // Ding-dong fuerte, repetido 2 veces para que NO pase desapercibido.
  const tones: Array<[number, number]> = [
    [660, 0],
    [880, 0.16],
    [660, 0.6],
    [880, 0.76],
  ];
  for (const [freq, delay] of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t0 = now + delay;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.45, t0 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.52);
  }
}
