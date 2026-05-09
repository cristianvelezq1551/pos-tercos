'use client';

import type { PublicDisplayState } from '@pos-tercos/types';
import { useEffect, useRef } from 'react';

/**
 * Pre-carga las imágenes de current + next en background usando `new Image()`.
 * Cuando una orden de `next` pasa a `current`, sus thumbs ya están en cache
 * del browser y no hay flash de imagen vacía.
 */
export function useImagePrefetch(state: PublicDisplayState) {
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = new Set<string>();
    if (state.current) {
      for (const item of state.current.items) {
        if (item.imageUrl) urls.add(item.imageUrl);
      }
    }
    for (const order of state.next) {
      for (const item of order.items) {
        if (item.imageUrl) urls.add(item.imageUrl);
      }
    }
    for (const url of urls) {
      if (seenRef.current.has(url)) continue;
      seenRef.current.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  }, [state]);
}
