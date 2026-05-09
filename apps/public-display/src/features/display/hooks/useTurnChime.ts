'use client';

import { useEffect, useRef } from 'react';

const THROTTLE_MS = 1200;
const SPEECH_DELAY_MS = 650;
const CHIME_GAIN = 0.85;

/**
 * Anuncia el cambio de turno en dos pasos:
 *   1) Campana de dos notas (~700 ms) — capta la atención.
 *   2) Voz `SpeechSynthesis` "Turno N" en es-CO — el cliente sabe que es lo suyo.
 *
 * Sin archivos de audio: usa Web Audio + Speech Synthesis del browser.
 *
 * Nota Chromecast: lanzar Chrome con
 *   --autoplay-policy=no-user-gesture-required
 * para que el primer anuncio no quede bloqueado por la policy del browser.
 */
function playChimeBell() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Acorde C-mayor brillante: G5 + C6 + E6, leve detune para "campanita".
    const tones: { freq: number; delay: number; dur: number }[] = [
      { freq: 783.99, delay: 0, dur: 0.85 },
      { freq: 1046.5, delay: 0.07, dur: 0.85 },
      { freq: 1318.5, delay: 0.14, dur: 0.85 },
    ];

    for (const { freq, delay, dur } of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t0 = now + delay;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(CHIME_GAIN, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    setTimeout(() => {
      void ctx.close();
    }, 1500);
  } catch {
    // Failsafe — nunca romper la UI por audio.
  }
}

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return (
    voices.find((v) => /es-CO/i.test(v.lang)) ??
    voices.find((v) => /es-MX/i.test(v.lang)) ??
    voices.find((v) => /es-ES/i.test(v.lang)) ??
    voices.find((v) => /^es/i.test(v.lang)) ??
    null
  );
}

function speakTurn(value: number) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(`Turno número ${value}`);
    utter.lang = 'es-CO';
    utter.rate = 0.92;
    utter.pitch = 1.05;
    utter.volume = 1;
    const voice = pickSpanishVoice();
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  } catch {
    // Failsafe.
  }
}

function announceTurn(value: number) {
  playChimeBell();
  setTimeout(() => speakTurn(value), SPEECH_DELAY_MS);
}

/**
 * Dispara el anuncio cuando `currentTurn` cambia. Ignora el primer mount.
 * Throttle 1200 ms para evitar doble play en doble click del cajero.
 */
export function useTurnChime(currentTurn: number) {
  const previousRef = useRef<number | null>(null);
  const lastPlayedRef = useRef<number>(0);

  // Pre-calienta las voces — Chrome las carga async.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const w = window.speechSynthesis;
    w.getVoices();
    const onChange = () => w.getVoices();
    w.addEventListener?.('voiceschanged', onChange);
    return () => w.removeEventListener?.('voiceschanged', onChange);
  }, []);

  useEffect(() => {
    if (previousRef.current === null) {
      previousRef.current = currentTurn;
      return;
    }
    if (previousRef.current === currentTurn) return;
    previousRef.current = currentTurn;

    const now = Date.now();
    if (now - lastPlayedRef.current < THROTTLE_MS) return;
    lastPlayedRef.current = now;

    announceTurn(currentTurn);
  }, [currentTurn]);
}
