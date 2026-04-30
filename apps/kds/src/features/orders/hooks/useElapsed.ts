'use client';

import { useEffect, useState } from 'react';

/**
 * Cronómetro client-side. Recalcula cada `tickMs` (default 1000ms) los
 * minutos/segundos transcurridos desde `since` hasta ahora. Si `since`
 * es null, retorna null.
 */
export function useElapsed(since: string | null, tickMs = 1000): { mins: number; secs: number } | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  if (!since) return null;
  const sinceMs = new Date(since).getTime();
  const diff = Math.max(0, now - sinceMs);
  const totalSecs = Math.floor(diff / 1000);
  return { mins: Math.floor(totalSecs / 60), secs: totalSecs % 60 };
}
