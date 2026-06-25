import { roundCost } from '../common/money';

/**
 * Replay FIFO de TODO el ledger de inventario — el núcleo de los reportes
 * de costos reales (P&L, márgenes por producto, valorización).
 *
 * Función PURA: recibe los movimientos como datos planos (el servicio de la
 * API los carga de Prisma y los mapea) y devuelve el costo FIFO atribuido a
 * cada venta + mermas valorizadas + lotes restantes.
 *
 * Orquestador cronológico: procesa TODOS los stockables en una sola pasada
 * por tiempo, manteniendo una cola FIFO por entidad. Necesario porque las
 * tandas de PRODUCCIÓN cruzan stockables:
 *   - consumen insumos (FIFO de sus lotes)
 *   - emiten +N de un subproducto con lot cost = suma de insumos / qty
 * El siguiente evento (venta o producción) puede consumir esos lotes recién
 * creados → interleaving temporal obligatorio.
 *
 * Sub-subproductos (A consume B al producirse): el costo se propaga solo,
 * porque B ya tiene lote cuando A se produce. Si B no tenía stock, el costo
 * de A queda parcialmente desconocido (unknownQty; nunca asumimos $0).
 *
 * PRE-CONDICIÓN: `movements` ordenados por createdAt ASC (el orden de
 * inserción desempata timestamps iguales).
 */

export type LedgerEntityType = 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';

export interface LedgerMovement {
  id: string;
  createdAt: Date;
  /** Positivo = entrada, negativo = consumo. */
  delta: number;
  type: string;
  /** Costo por unidad en entradas (PURCHASE/INITIAL/ajuste+). Null = desconocido. */
  unitCost: number | null;
  sourceType: string | null;
  sourceId: string | null;
  entityType: LedgerEntityType;
  ingredientId: string | null;
  productId: string | null;
  subproductId: string | null;
}

export interface CostQty {
  cost: number;
  qty: number;
  unknownQty: number;
}

/** Resultado del replay, indexado para los reportes. */
export interface LedgerFifo {
  /** saleId → ingredientId → costo/cantidad consumida (insumos directos). */
  saleIngredientCost: Map<string, Map<string, CostQty>>;
  /** saleId → productId → costo/cantidad (reventa directa). */
  saleProductCost: Map<string, Map<string, CostQty>>;
  /** saleId → subproductId → costo/cantidad (consumidos por preparados). */
  saleSubproductCost: Map<string, Map<string, CostQty>>;
  /** Mermas valorizadas con timestamp (no incluye consumos PRODUCTION). */
  waste: { createdAt: string; cost: number; unknownQty: number }[];
  /** Lotes restantes por stockable: `${entityType}:${id}` → valor/cantidad. */
  remaining: Map<string, { qty: number; value: number; unknownQty: number }>;
  /** Lotes restantes DETALLADOS (orden FIFO: más viejo primero) por stockable.
   *  `${entityType}:${id}` → [{qty, unitCost}]. Para mostrar "tu inventario
   *  rinde N porciones a $X, M a $Y" sin tocar el costeo. */
  remainingLots: Map<string, { qty: number; unitCost: number | null }[]>;
}

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

type Event =
  | { kind: 'single'; ts: Date; m: LedgerMovement }
  | { kind: 'production'; ts: Date; consumes: LedgerMovement[]; produces: LedgerMovement };

export function runLedgerFifo(movements: readonly LedgerMovement[]): LedgerFifo {
  const keyOf = (m: LedgerMovement): string | null => {
    const id =
      m.entityType === 'INGREDIENT' ? m.ingredientId
      : m.entityType === 'PRODUCT' ? m.productId
      : m.subproductId;
    return id ? `${m.entityType}:${id}` : null;
  };

  // Eventos: cada tanda de producción es UN evento atómico (sus movements
  // se procesan juntos para computar el lot cost del +N).
  const productionSeen = new Set<string>();
  const events: Event[] = [];
  for (const m of movements) {
    if (m.sourceType === 'production' && m.sourceId) {
      if (productionSeen.has(m.sourceId)) continue;
      productionSeen.add(m.sourceId);
      const batch = movements.filter(
        (x) => x.sourceType === 'production' && x.sourceId === m.sourceId,
      );
      const produces = batch.find((x) => x.delta > 0);
      const consumes = batch.filter((x) => x.delta < 0);
      if (!produces) continue; // batch malformado, ignorar
      events.push({ kind: 'production', ts: m.createdAt, consumes, produces });
    } else {
      events.push({ kind: 'single', ts: m.createdAt, m });
    }
  }
  // Estable por createdAt. Las producciones ya están atómicas.
  events.sort((a, b) => a.ts.getTime() - b.ts.getTime());

  const queues = new Map<string, Lot[]>();
  // Para revertir consumo de venta al anular: key = `${saleId}:${stockableKey}`.
  const drawsBySource = new Map<string, Draw[]>();

  const out: LedgerFifo = {
    saleIngredientCost: new Map(),
    saleProductCost: new Map(),
    saleSubproductCost: new Map(),
    waste: [],
    remaining: new Map(),
    remainingLots: new Map(),
  };

  const targetMap = (et: LedgerEntityType): Map<string, Map<string, CostQty>> => {
    if (et === 'INGREDIENT') return out.saleIngredientCost;
    if (et === 'PRODUCT') return out.saleProductCost;
    return out.saleSubproductCost;
  };
  const attributeToSale = (
    et: LedgerEntityType,
    stockableId: string,
    saleId: string,
    cost: number,
    qty: number,
    unknownQty: number,
  ): void => {
    const t = targetMap(et);
    const bySale = t.get(saleId) ?? new Map<string, CostQty>();
    const prev = bySale.get(stockableId) ?? { cost: 0, qty: 0, unknownQty: 0 };
    prev.cost += cost;
    prev.qty += qty;
    prev.unknownQty += unknownQty;
    bySale.set(stockableId, prev);
    t.set(saleId, bySale);
  };

  /** Consume FIFO de la cola del stockable. Devuelve costo + lotes tocados. */
  const consumeFifo = (
    key: string,
    qtyNeeded: number,
  ): { cost: number; unknownQty: number; draws: Draw[] } => {
    const q = queues.get(key) ?? [];
    let remaining = qtyNeeded;
    let cost = 0;
    let unknownQty = 0;
    const draws: Draw[] = [];
    while (remaining > 0 && q.length > 0) {
      const lot = q[0]!;
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
      if (lot.qty <= 0) q.shift();
    }
    if (remaining > 0) unknownQty += remaining;
    queues.set(key, q);
    return { cost: roundCost(cost), unknownQty: roundCost(unknownQty), draws };
  };

  const addLot = (key: string, lot: Lot): void => {
    const q = queues.get(key) ?? [];
    q.push(lot);
    queues.set(key, q);
  };

  for (const e of events) {
    if (e.kind === 'production') {
      // 1. Consumir insumos / sub-subproductos.
      let totalCost = 0;
      let totalUnknownQty = 0;
      let totalConsumedQty = 0;
      for (const c of e.consumes) {
        const cKey = keyOf(c);
        if (!cKey) continue;
        const { cost, unknownQty } = consumeFifo(cKey, Math.abs(c.delta));
        totalCost += cost;
        totalUnknownQty += unknownQty;
        totalConsumedQty += Math.abs(c.delta);
      }
      // 2. Crear el/los lote(s) del +N con costo derivado de los insumos.
      const posKey = keyOf(e.produces);
      const posQty = e.produces.delta;
      if (posKey && posQty > 0) {
        const iso = e.produces.createdAt.toISOString();
        if (totalUnknownQty <= 0) {
          // Todo el insumo tenía costo → lote con costo conocido.
          addLot(posKey, { movementId: e.produces.id, qty: posQty, unitCost: roundCost(totalCost / posQty), createdAt: iso });
        } else if (totalCost <= 0) {
          // Ningún insumo tenía costo → lote desconocido (NUNCA asumimos $0).
          addLot(posKey, { movementId: e.produces.id, qty: posQty, unitCost: null, createdAt: iso });
        } else {
          // PARCIAL: algunos insumos con costo, otros sin. NO se descarta el
          // costo conocido (eso subestimaba el COGS). Se prorratea la fracción
          // de insumo SIN costo a las unidades producidas: esa porción entra
          // como lote sin costo (unknownQty) y el resto lleva TODO el costo
          // conocido (su value = totalCost, así el agregado queda exacto).
          const unknownFrac = Math.min(1, totalUnknownQty / totalConsumedQty);
          const unknownQ = roundCost(posQty * unknownFrac);
          const knownQ = roundCost(posQty - unknownQ);
          if (knownQ <= 0) {
            // Borde de redondeo: el costo conocido es marginal → repartir sobre todo.
            addLot(posKey, { movementId: e.produces.id, qty: posQty, unitCost: roundCost(totalCost / posQty), createdAt: iso });
          } else {
            addLot(posKey, { movementId: e.produces.id, qty: knownQ, unitCost: roundCost(totalCost / knownQ), createdAt: iso });
            if (unknownQ > 0) {
              addLot(posKey, { movementId: e.produces.id, qty: unknownQ, unitCost: null, createdAt: iso });
            }
          }
        }
      }
      continue;
    }

    // === SINGLE ===
    const m = e.m;
    const key = keyOf(m);
    if (!key) continue;
    const delta = m.delta;
    const iso = m.createdAt.toISOString();

    // Reversión de venta (anulación): SALE con delta > 0.
    if (m.type === 'SALE' && delta > 0) {
      const drawKey = `${m.sourceId ?? ''}:${key}`;
      const draws = drawsBySource.get(drawKey) ?? [];
      let returnedCost = 0;
      let returnedUnknown = 0;
      let returnedQty = 0;
      // Re-inyectar al FRENTE en orden inverso (más viejos primero).
      const q = queues.get(key) ?? [];
      for (let i = draws.length - 1; i >= 0; i--) {
        const d = draws[i]!;
        q.unshift({
          movementId: d.movementId,
          qty: d.qty,
          unitCost: d.unitCost,
          createdAt: d.createdAt,
        });
        returnedQty += d.qty;
        if (d.unitCost === null) returnedUnknown += d.qty;
        else returnedCost += d.qty * d.unitCost;
      }
      queues.set(key, q);
      drawsBySource.delete(drawKey);
      // Atribuir el reverso (cost negativo) a la misma venta original.
      if (m.sourceId) {
        const stockableId = key.slice(key.indexOf(':') + 1);
        attributeToSale(
          m.entityType,
          stockableId,
          m.sourceId,
          -roundCost(returnedCost),
          returnedQty,
          returnedUnknown,
        );
      }
      continue;
    }

    // Entrada (PURCHASE, INITIAL, MANUAL_ADJUSTMENT+).
    if (delta > 0) {
      addLot(key, {
        movementId: m.id,
        qty: delta,
        unitCost: m.unitCost,
        createdAt: iso,
      });
      continue;
    }

    // Consumo (SALE, WASTE, MANUAL_ADJUSTMENT-).
    const { cost, unknownQty, draws } = consumeFifo(key, -delta);
    if (m.type === 'SALE' && m.sourceId) {
      drawsBySource.set(`${m.sourceId}:${key}`, draws);
      const stockableId = key.slice(key.indexOf(':') + 1);
      attributeToSale(m.entityType, stockableId, m.sourceId, cost, -delta, unknownQty);
    } else if (m.type === 'WASTE') {
      out.waste.push({ createdAt: iso, cost, unknownQty });
    }
    // MANUAL_ADJUSTMENT- no se atribuye (sale del libro y listo).
  }

  // Construir remaining + remainingLots a partir del estado final de cada cola.
  for (const [key, q] of queues) {
    let value = 0;
    let unknownQty = 0;
    let qty = 0;
    const lots: { qty: number; unitCost: number | null }[] = [];
    for (const l of q) {
      if (l.qty <= 0) continue;
      qty += l.qty;
      if (l.unitCost === null) unknownQty += l.qty;
      else value += l.qty * l.unitCost;
      lots.push({ qty: roundCost(l.qty), unitCost: l.unitCost });
    }
    out.remaining.set(key, {
      qty: roundCost(qty),
      value: roundCost(value),
      unknownQty: roundCost(unknownQty),
    });
    if (lots.length > 0) out.remainingLots.set(key, lots);
  }
  return out;
}
