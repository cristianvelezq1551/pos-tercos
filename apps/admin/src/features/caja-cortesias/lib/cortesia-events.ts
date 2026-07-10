'use client';

/** Señal de que el cajero registró una cortesía → el watcher arranca a vigilar. */
export const CORTESIA_ACTIVITY_EVENT = 'pos:cortesia-activity';

export function notifyCortesiaActivity(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CORTESIA_ACTIVITY_EVENT));
  }
}
