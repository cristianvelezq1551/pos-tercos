'use client';

import type { PublicDisplayState } from '@pos-tercos/types';
import { useDisplayStream } from '../hooks/useDisplayStream';
import { useImagePrefetch } from '../hooks/useImagePrefetch';
import { useKioskGuards } from '../hooks/useKioskGuards';
import { useStreamWatchdog } from '../hooks/useStreamWatchdog';
import { useTurnChime } from '../hooks/useTurnChime';
import { ConnectionIndicator } from './ConnectionIndicator';
import { Header } from './Header';
import { IdleView } from './IdleView';
import { PreparingView } from './PreparingView';
import { ReadyView } from './ReadyView';

type DisplayMode = 'ready' | 'preparing' | 'idle';

function pickMode(state: PublicDisplayState): DisplayMode {
  if (state.current) return 'ready';
  if (state.next.length > 0) return 'preparing';
  return 'idle';
}

export function Display({ initial }: { initial: PublicDisplayState }) {
  const { state, connection } = useDisplayStream(initial);
  useKioskGuards();
  useStreamWatchdog();
  useImagePrefetch(state);
  useTurnChime(state.currentTurn);
  const mode = pickMode(state);

  return (
    <div className="relative flex h-dvh w-dvw flex-col overflow-hidden bg-background text-foreground">
      <Header turn={state.currentTurn} />
      <main className="flex flex-1 flex-col px-[5vw] pb-[5vh] pt-[2vh]">
        {mode === 'ready' && state.current ? (
          <ReadyView current={state.current} next={state.next} />
        ) : null}
        {mode === 'preparing' ? <PreparingView next={state.next} /> : null}
        {mode === 'idle' ? <IdleView /> : null}
      </main>
      <ConnectionIndicator connection={connection} />
    </div>
  );
}
