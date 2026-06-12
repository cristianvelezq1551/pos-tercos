'use client';

/**
 * AudioContext compartido del POS (Web Audio API, sin assets). Se desbloquea
 * con la primera interacción del cajero (clicks), así que para cuando suena
 * el primer aviso ya está activo. Los chimes (pedido web, pedido listo)
 * piden el contexto acá en vez de duplicar el fallback webkit.
 */
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  } catch {
    ctx = null;
  }
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}
