'use client';

import { useEffect, useState } from 'react';
import { getAudioContext } from '../hooks/useAudioContext';

const HIDE_DELAY_MS = 200;

/**
 * Overlay full-screen que se muestra al primer mount y desaparece tras el
 * primer gesture (touch/click/keydown) o automáticamente cuando el
 * AudioContext arranca en estado `running` (caso ideal en TVs sin policy).
 *
 * Sirve para desbloquear el AudioContext en browsers/TVs con autoplay
 * policy estricta. Una sola vez por sesión: cuando el usuario lo dismissea,
 * queda guardado en sessionStorage y no vuelve a aparecer en esa sesión.
 */
export function AudioPrimer() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = sessionStorage.getItem('audio-primed') === '1';
    if (dismissed) return;

    const ctx = getAudioContext();
    if (ctx && ctx.state === 'running') {
      sessionStorage.setItem('audio-primed', '1');
      return;
    }
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
      sessionStorage.setItem('audio-primed', '1');
      setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    };
    window.addEventListener('pointerdown', dismiss, { once: true });
    window.addEventListener('keydown', dismiss, { once: true });
    window.addEventListener('touchstart', dismiss, { once: true });

    // Auto-dismiss SIEMPRE a los 8s, haya o no gesture. En un kiosko sin touch
    // la música puede quedar muda, pero el overlay NUNCA debe tapar la pantalla.
    const auto = setTimeout(() => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
      sessionStorage.setItem('audio-primed', '1');
      setVisible(false);
    }, 8000);

    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('touchstart', dismiss);
      clearTimeout(auto);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-bg-dark"
      style={{ cursor: 'pointer' }}
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="text-7xl font-extrabold tracking-[0.18em] text-accent uppercase">
          TERCOS
        </div>
        <div className="h-1 w-16 rounded-full bg-accent" />
        <p className="text-2xl font-semibold text-text-muted">
          Tocá la pantalla para iniciar
        </p>
      </div>
    </div>
  );
}
