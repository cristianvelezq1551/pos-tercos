'use client';

import type { DisplayTrack } from '@pos-tercos/types';
import { useEffect, useRef } from 'react';
import { logError } from '../../../lib/client-log';

/**
 * Reproduce las pistas de música ambiente configuradas por el dueño, en bucle,
 * una tras otra. El autoplay del browser/kiosko exige un gesto previo: se
 * intenta arrancar de una y, si lo bloquean, se reintenta en el primer
 * pointer/touch/key (los mismos gestos que desbloquean el audio). Si no hay
 * pistas configuradas, no hace nada.
 */
export function useAmbientMusic(tracks: DisplayTrack[]): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const indexRef = useRef(0);
  // Clave estable de la lista activa: re-arranca solo si cambian las pistas.
  const key = tracks.map((t) => t.id).join(',');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (tracks.length === 0) {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }

    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;
    indexRef.current = 0;

    const playCurrent = () => {
      const track = tracks[indexRef.current % tracks.length];
      audio.src = track.audioUrl;
      void audio.play().catch(() => undefined);
    };

    const next = () => {
      indexRef.current = (indexRef.current + 1) % tracks.length;
      playCurrent();
    };

    // Si una pista falla (404, formato), registrar y pasar a la siguiente sin
    // trabarse (config rota que el dueño debe corregir en /turnero).
    const onError = () => {
      logError('ambient-music', audio.error ?? new Error('audio error'), {
        src: audio.currentSrc,
      });
      window.setTimeout(next, 2000);
    };

    audio.addEventListener('ended', next);
    audio.addEventListener('error', onError);

    const tryResume = () => {
      if (audio.paused) void audio.play().catch(() => undefined);
    };
    window.addEventListener('pointerdown', tryResume);
    window.addEventListener('touchstart', tryResume);
    window.addEventListener('keydown', tryResume);
    window.addEventListener('click', tryResume);

    playCurrent();

    return () => {
      audio.removeEventListener('ended', next);
      audio.removeEventListener('error', onError);
      window.removeEventListener('pointerdown', tryResume);
      window.removeEventListener('touchstart', tryResume);
      window.removeEventListener('keydown', tryResume);
      window.removeEventListener('click', tryResume);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
