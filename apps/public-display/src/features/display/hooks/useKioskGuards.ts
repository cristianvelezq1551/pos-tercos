'use client';

import { useEffect } from 'react';

const BLOCKED_KEYS = new Set(['F5', 'F11', 'F12']);
const BLOCKED_LETTER_COMBOS = new Set(['r', 'R', 'w', 'W']);

/**
 * Bloquea menú contextual y atajos comunes del browser. Pensado para evitar
 * que un teclado bluetooth conectado por error reinicie o cierre la pantalla.
 *
 * Limitaciones: Cmd+Q (macOS), Alt+F4 (Windows), apagado físico del Chromecast
 * NO se pueden bloquear desde JS — se asumen.
 */
export function useKioskGuards() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        BLOCKED_LETTER_COMBOS.has(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onDragStart = (e: DragEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown, { capture: true });
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('dragstart', onDragStart);

    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('dragstart', onDragStart);
    };
  }, []);
}
