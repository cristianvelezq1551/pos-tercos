'use client';

import type { PublicDisplayState } from '@pos-tercos/types';
import { useDisplayStream } from '../hooks/useDisplayStream';
import { useAudioContext } from '../hooks/useAudioContext';
import { useKioskGuards } from '../hooks/useKioskGuards';
import { useStreamWatchdog } from '../hooks/useStreamWatchdog';
import { useTurnChime } from '../hooks/useTurnChime';
import { AudioDebugPanel } from './AudioDebugPanel';
import { AudioPrimer } from './AudioPrimer';
import { Brand } from './Brand';
import { Carousel } from './Carousel';
import { Clock } from './Clock';
import { TurnBadgeCircular } from './TurnBadgeCircular';
import { WhiteFlashOverlay } from './WhiteFlashOverlay';

export function Display({ initial }: { initial: PublicDisplayState }) {
  const { state } = useDisplayStream(initial);
  useAudioContext();
  useKioskGuards();
  useStreamWatchdog();
  useTurnChime(state.currentTurn);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-bg-dark text-text-white">
      {/* Carrusel ocupa el viewport entero (cover, recorta si aspect ratio != 16:9). */}
      <Carousel currentTurn={state.currentTurn} />

      {/* Chrome posicionado sobre el viewport real — siempre visible. */}
      <Brand />
      <Clock />
      <TurnBadgeCircular value={state.currentTurn} />

      <WhiteFlashOverlay value={state.currentTurn} />
      <AudioPrimer />
      <AudioDebugPanel />
    </div>
  );
}
