'use client';

import { isUnseenObserved } from '../api/client';
import { useCortesiaWatch } from '../components/CortesiaWatchProvider';

/**
 * Cuenta de cortesías "Observadas" sin acusar (badge del nav). Lee del watcher
 * compartido — no genera polling propio.
 */
export function useUnseenCortesias(): number {
  const { items } = useCortesiaWatch();
  return items.filter(isUnseenObserved).length;
}
