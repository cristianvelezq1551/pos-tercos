'use client';

import {
  DisplayBrollConfigSchema,
  type DisplayTrack,
} from '@pos-tercos/types';
import { useEffect, useState } from 'react';
import { BROLL_MENU, type BrollItem } from '../lib/broll-menu';

const REFRESH_MS = 5 * 60 * 1000; // el dueño edita en admin; propaga sin reiniciar el kiosko

export interface BrollConfig {
  items: BrollItem[];
  tracks: DisplayTrack[];
}

/**
 * Trae el contenido del turnero configurado por el dueño (`/api/display/broll`).
 * Si no hay nada configurado o el endpoint falla, cae al menú por defecto
 * (`BROLL_MENU`) — el turnero NUNCA queda vacío. Re-consulta cada 5 min para
 * reflejar cambios del admin sin reiniciar la pantalla.
 */
export function useBrollConfig(): BrollConfig {
  const [config, setConfig] = useState<BrollConfig>({ items: BROLL_MENU, tracks: [] });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/display/broll', { cache: 'no-store' });
        if (!res.ok) return;
        const parsed = DisplayBrollConfigSchema.safeParse(await res.json());
        if (cancelled || !parsed.success) return;
        const items: BrollItem[] = parsed.data.slides.map((s) => ({
          img: s.imageUrl,
          name: s.name,
          tag: s.tag,
          price: s.price,
          desc: s.description,
        }));
        // Slides vacíos → conservar el fallback (no romper la vista actual).
        setConfig({
          items: items.length > 0 ? items : BROLL_MENU,
          tracks: parsed.data.tracks,
        });
      } catch {
        // Sin red / API caída → se queda con lo último bueno (o el fallback).
      }
    };

    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return config;
}
