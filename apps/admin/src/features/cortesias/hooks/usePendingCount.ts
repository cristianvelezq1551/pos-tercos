'use client';

import { useEffect, useState } from 'react';
import { listCortesias } from '../api/client';

/** Cuenta de cortesías "Sin revisar" para el badge del sidebar. */
export function useCortesiaPendingCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      listCortesias('PENDING')
        .then((r) => {
          if (alive) setCount(r.length);
        })
        .catch(() => undefined);
    void load();
    const id = setInterval(() => void load(), 30_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return count;
}
