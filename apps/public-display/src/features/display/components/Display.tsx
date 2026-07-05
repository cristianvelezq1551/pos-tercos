'use client';

import { useAmbientMusic } from '../hooks/useAmbientMusic';
import { useBrollConfig } from '../hooks/useBrollConfig';
import { useAudioContext } from '../hooks/useAudioContext';
import { useKioskGuards } from '../hooks/useKioskGuards';
import { useWakeLock } from '../hooks/useWakeLock';
import { AudioDebugPanel } from './AudioDebugPanel';
import { AudioPrimer } from './AudioPrimer';
import { BrollStage } from './BrollStage';
import { SoundActivationPill } from './SoundActivationPill';

/**
 * Pantalla del local (TV): señalética de marca + productos rotando + música
 * ambiente. Sin turnos — el dueño configura el contenido desde admin
 * (`useBrollConfig` consulta `/api/display/broll`).
 */
export function Display() {
  const { items, tracks } = useBrollConfig();
  useAudioContext();
  useAmbientMusic(tracks);
  useKioskGuards();
  useWakeLock();

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-bg-dark text-text-white">
      {/* B-roll de marca: marca + producto rotando + foto del plato. Ocupa el
          viewport entero. */}
      <BrollStage items={items} />

      <AudioPrimer />
      <SoundActivationPill />
      <AudioDebugPanel />
    </div>
  );
}
