import type { CloseShift, DigitalCountLine } from '@pos-tercos/types';
import { toBreakdownLines } from './denominations';

/**
 * Arma el payload de cierre de caja desde el estado del modal. Pura (sin IO):
 * mapea el arqueo por denominación, el conteo digital por método y los extras.
 */
export function buildClosePayload(args: {
  countedCash: number;
  arqueo: boolean;
  counts: Record<number, number>;
  digitalCounts: Record<string, number | null>;
  tips: number | null;
  notes: string;
}): CloseShift {
  const digital = Object.entries(args.digitalCounts)
    .filter(([, v]) => v !== null)
    .map(([method, v]) => ({
      method: method as DigitalCountLine['method'],
      counted: v!,
    }));
  return {
    countedCash: args.countedCash,
    breakdown: args.arqueo ? toBreakdownLines(args.counts) : undefined,
    digitalCounts: digital.length > 0 ? digital : undefined,
    tips: args.tips ?? undefined,
    notes: args.notes.trim() || undefined,
  };
}
