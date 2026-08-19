'use client';

import type { Product } from '@pos-tercos/types';
import { useState } from 'react';
import { setForceAvailable, setSoldOut } from '../api';

/**
 * Overrides optimistas de disponibilidad manual: pisan los flags del producto
 * mientras el refetch de disponibilidad llega del backend. Dos estados
 * excluyentes — "86" (soldOut) y "forzar disponible" (forceAvailable):
 * activar uno limpia el otro (igual que el backend).
 */
export function useSoldOutToggle(refresh: () => Promise<void>) {
  const [soldOutOverride, setSoldOutOverride] = useState<Map<string, boolean>>(new Map());
  const [forceAvailableOverride, setForceAvailableOverride] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const run = async (
    p: Product,
    call: () => Promise<void>,
    optimistic: () => void,
    revert: () => void,
  ) => {
    setTogglingId(p.id);
    optimistic();
    try {
      await call();
      await refresh();
    } catch {
      revert(); // el backend rechazó → deshacer el override
    } finally {
      setTogglingId(null);
    }
  };

  const toggleSoldOut = (p: Product, nextSoldOut: boolean) =>
    run(
      p,
      () => setSoldOut(p.id, nextSoldOut),
      () => {
        setSoldOutOverride((m) => new Map(m).set(p.id, nextSoldOut));
        // 86 y forzado son excluyentes.
        if (nextSoldOut) setForceAvailableOverride((m) => new Map(m).set(p.id, false));
      },
      () => {
        setSoldOutOverride((m) => {
          const n = new Map(m);
          n.delete(p.id);
          return n;
        });
        setForceAvailableOverride((m) => {
          const n = new Map(m);
          n.delete(p.id);
          return n;
        });
      },
    );

  const toggleForceAvailable = (p: Product, nextForced: boolean) =>
    run(
      p,
      () => setForceAvailable(p.id, nextForced),
      () => {
        setForceAvailableOverride((m) => new Map(m).set(p.id, nextForced));
        if (nextForced) setSoldOutOverride((m) => new Map(m).set(p.id, false));
      },
      () => {
        setForceAvailableOverride((m) => {
          const n = new Map(m);
          n.delete(p.id);
          return n;
        });
        setSoldOutOverride((m) => {
          const n = new Map(m);
          n.delete(p.id);
          return n;
        });
      },
    );

  return {
    soldOutOverride,
    forceAvailableOverride,
    togglingId,
    toggleSoldOut,
    toggleForceAvailable,
  };
}
