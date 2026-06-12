'use client';

import type { Product } from '@pos-tercos/types';
import { useState } from 'react';
import { setSoldOut } from '../api';

/**
 * Toggle manual "86" con estado optimista: el override pisa el flag del
 * producto mientras el refetch de disponibilidad llega del backend.
 */
export function useSoldOutToggle(refresh: () => Promise<void>) {
  const [soldOutOverride, setSoldOutOverride] = useState<Map<string, boolean>>(new Map());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleSoldOut = async (p: Product, nextSoldOut: boolean) => {
    setTogglingId(p.id);
    setSoldOutOverride((m) => new Map(m).set(p.id, nextSoldOut));
    try {
      await setSoldOut(p.id, nextSoldOut);
      await refresh();
    } catch {
      // Revertir el override si el backend rechazó.
      setSoldOutOverride((m) => {
        const next = new Map(m);
        next.delete(p.id);
        return next;
      });
    } finally {
      setTogglingId(null);
    }
  };

  return { soldOutOverride, togglingId, toggleSoldOut };
}
