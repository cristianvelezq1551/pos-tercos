import { roundCost } from '../common/money';
import type { FifoConsumption, FifoLot, FifoMovement, FifoResult } from './types';

interface Lot {
  movementId: string;
  qty: number;
  unitCost: number | null;
  createdAt: string;
}

interface Draw {
  qty: number;
  unitCost: number | null;
  movementId: string;
  createdAt: string;
}


function toIso(d: string | Date): string {
  return typeof d === 'string' ? d : d.toISOString();
}

/**
 * Motor FIFO para UN stockable. Reproduce el ledger ordenado en el tiempo:
 *  - Entradas (delta > 0) crean lotes (capas de costo).
 *  - Consumos (delta < 0) descuentan del lote más viejo, acumulando el costo
 *    real; lo que no tiene costo conocido (lote sin costo o stock negativo) se
 *    reporta como `unknownQty` en vez de asumir $0.
 *  - Reversión de anulación (SALE con delta > 0 y mismo `sourceId` que consumos
 *    previos) re-inyecta exactamente los lotes que el consumo original sacó
 *    (devuelve el costo exacto → el COGS neto de una venta anulada es 0).
 *
 * Determinístico y sin IO. Orden estable: por `createdAt` asc; ante empate, las
 * entradas (delta > 0) van antes que los consumos para que el stock exista.
 */
export function runFifo(movements: FifoMovement[]): FifoResult {
  const ordered = [...movements].sort((a, b) => {
    const ta = toIso(a.createdAt);
    const tb = toIso(b.createdAt);
    if (ta !== tb) return ta < tb ? -1 : 1;
    // Empate: entradas primero (delta desc), luego por id para estabilidad.
    if (a.delta !== b.delta) return b.delta - a.delta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const queue: Lot[] = [];
  const consumptions: FifoConsumption[] = [];
  // Lotes consumidos por cada SALE (por sourceId) para poder revertir exacto.
  const drawsBySource = new Map<string, Draw[]>();

  for (const mov of ordered) {
    const iso = toIso(mov.createdAt);

    // ── Reversión de anulación: SALE con delta > 0 ──────────────────
    if (mov.type === 'SALE' && mov.delta > 0) {
      const key = mov.sourceId ?? '';
      const draws = drawsBySource.get(key) ?? [];
      let returnedQty = 0;
      let returnedCost = 0;
      let returnedUnknown = 0;
      // Re-inyecta al FRENTE en orden inverso (los más viejos quedan primero).
      for (let i = draws.length - 1; i >= 0; i--) {
        const d = draws[i]!;
        queue.unshift({
          movementId: d.movementId,
          qty: d.qty,
          unitCost: d.unitCost,
          createdAt: d.createdAt,
        });
        returnedQty += d.qty;
        if (d.unitCost === null) returnedUnknown += d.qty;
        else returnedCost += d.qty * d.unitCost;
      }
      drawsBySource.delete(key);
      consumptions.push({
        movementId: mov.id,
        createdAt: iso,
        type: 'SALE',
        sourceId: mov.sourceId,
        qty: returnedQty,
        cost: roundCost(-returnedCost),
        unknownQty: returnedUnknown,
      });
      continue;
    }

    // ── Entrada (compra / inicial / ajuste+) ────────────────────────
    if (mov.delta > 0) {
      queue.push({
        movementId: mov.id,
        qty: mov.delta,
        unitCost: mov.unitCost,
        createdAt: iso,
      });
      continue;
    }

    // ── Consumo (venta / merma / ajuste−) ───────────────────────────
    let remaining = -mov.delta;
    let cost = 0;
    let unknownQty = 0;
    const draws: Draw[] = [];
    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0]!;
      const take = Math.min(remaining, lot.qty);
      if (lot.unitCost === null) unknownQty += take;
      else cost += take * lot.unitCost;
      draws.push({
        qty: take,
        unitCost: lot.unitCost,
        movementId: lot.movementId,
        createdAt: lot.createdAt,
      });
      lot.qty -= take;
      remaining -= take;
      if (lot.qty <= 0) queue.shift();
    }
    if (remaining > 0) {
      // Consumió más de lo que el ledger conoce (stock negativo / descuadre).
      unknownQty += remaining;
    }
    if (mov.type === 'SALE') {
      const key = mov.sourceId ?? '';
      const prev = drawsBySource.get(key);
      if (prev) prev.push(...draws);
      else drawsBySource.set(key, draws);
    }
    consumptions.push({
      movementId: mov.id,
      createdAt: iso,
      type: mov.type,
      sourceId: mov.sourceId,
      qty: -mov.delta,
      cost: roundCost(cost),
      unknownQty: roundCost(unknownQty),
    });
  }

  let remainingValue = 0;
  let remainingUnknownQty = 0;
  const remainingLots: FifoLot[] = queue.map((l) => {
    if (l.unitCost === null) remainingUnknownQty += l.qty;
    else remainingValue += l.qty * l.unitCost;
    return {
      movementId: l.movementId,
      qty: roundCost(l.qty),
      unitCost: l.unitCost,
      createdAt: l.createdAt,
    };
  });

  return {
    consumptions,
    remainingLots,
    remainingValue: roundCost(remainingValue),
    remainingUnknownQty: roundCost(remainingUnknownQty),
  };
}
