'use client';

import type { PublicDisplayState } from '@pos-tercos/types';
import { useDisplayStream } from '../hooks/useDisplayStream';
import { useAudioContext } from '../hooks/useAudioContext';
import { useKioskGuards } from '../hooks/useKioskGuards';
import { useStreamWatchdog } from '../hooks/useStreamWatchdog';
import { useTurnChime } from '../hooks/useTurnChime';
import { useWakeLock } from '../hooks/useWakeLock';
import { AudioDebugPanel } from './AudioDebugPanel';
import { AudioPrimer } from './AudioPrimer';
import { Brand } from './Brand';
import { Carousel } from './Carousel';
import { Clock } from './Clock';
import { SoundActivationPill } from './SoundActivationPill';
import { TurnBadgeCircular } from './TurnBadgeCircular';
import { WhiteFlashOverlay } from './WhiteFlashOverlay';

export function Display({ initial }: { initial: PublicDisplayState }) {
  const { state, connection } = useDisplayStream(initial);
  useAudioContext();
  useKioskGuards();
  useWakeLock();
  useStreamWatchdog(connection);
  const hasTurn = state.currentTurn !== null;
  useTurnChime(state.callSeq, hasTurn);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-bg-dark text-text-white">
      {/* Carrusel ocupa el viewport entero (cover, recorta si aspect ratio != 16:9). */}
      <Carousel trigger={state.callSeq} hasTurn={hasTurn} />

      {/* Chrome posicionado sobre el viewport real — siempre visible. */}
      <Brand />
      <Clock />
      <TurnBadgeCircular value={state.currentTurn} trigger={state.callSeq} hasTurn={hasTurn} />

      <WhiteFlashOverlay trigger={state.callSeq} hasTurn={hasTurn} />
      <AudioPrimer />
      <SoundActivationPill />
      <AudioDebugPanel />

      {/* Indicador discreto: solo aparece si la conexión no está sana. */}
      {connection !== 'live' ? (
        <div
          className="pointer-events-none fixed bottom-3 right-3 z-[150] flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm"
          aria-hidden="true"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          <span className="text-xs font-medium text-amber-200">Reconectando…</span>
        </div>
      ) : null}
    </div>
  );
}
