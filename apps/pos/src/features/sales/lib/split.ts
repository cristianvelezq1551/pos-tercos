import type { PaymentMethod } from '@pos-tercos/types';
import type { CartTotalsResult } from './totals';

/** Máximo de partes en una cuenta dividida (espejo de MAX_SPLIT_PARTS). */
export const MAX_PARTS = 10;

export type SplitMode = 'equal' | 'items' | 'amounts';

/** Una parte de la cuenta en edición (estado de UI, no wire). */
export interface SplitPart {
  /** 1-based — "Persona 1", "Persona 2"… */
  index: number;
  amount: number;
  method: PaymentMethod | null;
  /** Solo CASH: efectivo recibido para esta parte. */
  cashReceived: number | null;
  /** Solo digital: el cajero verificó ESTE comprobante. */
  verified: boolean;
}

/** Una unidad asignable en modo "por productos" (1 fila = 1 unidad vendida). */
export interface SplitUnit {
  key: string;
  label: string;
  /** Precio de la unidad con su parte del descuento de promo ya prorrateada. */
  amount: number;
  /** A qué persona (1-based) está asignada. */
  assignedTo: number;
}

/**
 * Divide el total en N partes enteras (COP) que suman EXACTO: las primeras
 * `total % n` partes llevan $1 más.
 */
export function equalSplitAmounts(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const remainder = Math.round(total - base * n);
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Expande el carrito a unidades individuales para asignar por persona.
 * El precio de cada unidad sale de `lineTotal / quantity` (descuento de promo
 * prorrateado); el remanente del redondeo va a las primeras unidades para que
 * la suma de unidades = total exacto.
 */
export function explodeUnits(totals: CartTotalsResult): SplitUnit[] {
  const units: SplitUnit[] = [];
  for (const line of totals.lines) {
    const perUnit = Math.floor(line.lineTotal / line.quantity);
    const remainder = Math.round(line.lineTotal - perUnit * line.quantity);
    for (let i = 0; i < line.quantity; i++) {
      units.push({
        key: `${line.lineId}:${i}`,
        label: line.quantity > 1 ? `${line.productName} (${i + 1}/${line.quantity})` : line.productName,
        amount: perUnit + (i < remainder ? 1 : 0),
        assignedTo: 1,
      });
    }
  }
  return units;
}

/** Re-deriva los montos de las partes desde las unidades asignadas. */
export function amountsFromUnits(units: readonly SplitUnit[], parts: number): number[] {
  const out = Array.from({ length: parts }, () => 0);
  for (const u of units) {
    const idx = Math.min(Math.max(u.assignedTo, 1), parts) - 1;
    out[idx]! += u.amount;
  }
  return out;
}

export interface SplitValidation {
  ok: boolean;
  reason: string | null;
}

/** Validación de la cuenta completa antes de habilitar el cobro. */
export function validateSplit(parts: readonly SplitPart[], total: number): SplitValidation {
  const sum = parts.reduce((acc, p) => acc + p.amount, 0);
  if (Math.abs(sum - total) > 0.005) {
    const diff = total - sum;
    return {
      ok: false,
      reason: diff > 0 ? `Faltan $${diff.toLocaleString('es-CO')} por asignar` : `Sobran $${(-diff).toLocaleString('es-CO')} asignados`,
    };
  }
  for (const p of parts) {
    if (p.amount <= 0) return { ok: false, reason: `La parte ${p.index} no tiene monto` };
    if (!p.method) return { ok: false, reason: `Elegí el método de la persona ${p.index}` };
    if (p.method === 'CASH') {
      if (p.cashReceived === null || p.cashReceived < p.amount) {
        return { ok: false, reason: `Persona ${p.index}: el efectivo recibido no cubre su parte` };
      }
    } else if (!p.verified) {
      return { ok: false, reason: `Persona ${p.index}: confirmá que su pago llegó` };
    }
  }
  return { ok: true, reason: null };
}

/** Vuelto total (solo partes en efectivo). */
export function totalChange(parts: readonly SplitPart[]): number {
  return parts.reduce(
    (acc, p) =>
      acc + (p.method === 'CASH' && p.cashReceived !== null ? Math.max(0, p.cashReceived - p.amount) : 0),
    0,
  );
}
