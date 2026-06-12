'use client';

import { getAudioContext } from '../../../lib/audio';

/**
 * Aviso sonoro cuando la cocina marca un pedido LISTO (entra a "Por llamar").
 * Tono ascendente distinto al de pedidos web, para que el cajero los diferencie.
 * Web Audio API, sin asset. El AudioContext se desbloquea con los clicks del POS.
 */

export function playReadyChime(): void {
  const c = getAudioContext();
  if (!c) return;
  const now = c.currentTime;
  // Arpegio ascendente (do-mi-sol) → "pedido listo".
  const tones: Array<[number, number]> = [
    [523, 0],
    [659, 0.13],
    [784, 0.26],
  ];
  for (const [freq, delay] of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = now + delay;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  }
}
