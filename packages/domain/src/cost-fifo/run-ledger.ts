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
 * inserción —por id— desempata timestamps iguales dentro de una misma fase).
 * Para timestamps EXACTAMENTE iguales entre fases distintas, el replay aplica
 * un desempate causal: entradas → producciones → consumos (ver `phaseOf`).
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
  /** Cortesías valorizadas a FIFO con timestamp (consumo sourceType='cortesia'). */
  cortesia: { createdAt: string; cost: number; unknownQty: number }[];
  /** Costo FIFO por solicitud de cortesía: sourceId → costo total + unknownQty. */
  cortesiaCostBySource: Map<string, { cost: number; unknownQty: number }>;
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

  // Pre-agrupar las tandas de producción en UNA pasada O(n). Antes se hacía un
  // `movements.filter(...)` de la tabla entera por CADA tanda → O(producciones×n),
  // cuadrático: con meses de datos el replay congelaba el event loop (que es el
  // mismo que cobra las ventas).
  const productionBatches = new Map<string, LedgerMovement[]>();
  for (const m of movements) {
    if (m.sourceType === 'production' && m.sourceId) {
      const arr = productionBatches.get(m.sourceId);
      if (arr) arr.push(m);
      else productionBatches.set(m.sourceId, [m]);
    }
  }

  // Eventos: cada tanda de producción es UN evento atómico (sus movements
  // se procesan juntos para computar el lot cost del +N).
  const productionSeen = new Set<string>();
  const events: Event[] = [];
  for (const m of movements) {
    if (m.sourceType === 'production' && m.sourceId) {
      if (productionSeen.has(m.sourceId)) continue;
      productionSeen.add(m.sourceId);
      const batch = productionBatches.get(m.sourceId)!;
      const produces = batch.find((x) => x.delta > 0);
      const consumes = batch.filter((x) => x.delta < 0);
      if (!produces) {
        // Batch malformado (sin +N, datos corruptos): los consumos EXISTEN en
        // la DB — se aplican como consumos sueltos para que el replay no
        // infle el inventario respecto del stock real (auditoría 2026-07-05).
        for (const c of consumes) events.push({ kind: 'single', ts: c.createdAt, m: c });
        continue;
      }
      // Positivos EXTRA (batch corrupto con 2+ entradas): también existen en
      // la DB — entran como entradas sueltas (lote con su unitCost, null si
      // no tiene) en vez de droppearse del replay.
      for (const extra of batch) {
        if (extra.delta > 0 && extra !== produces) {
          events.push({ kind: 'single', ts: extra.createdAt, m: extra });
        }
      }
      events.push({ kind: 'production', ts: m.createdAt, consumes, produces });
    } else {
      events.push({ kind: 'single', ts: m.createdAt, m });
    }
  }
  // Orden cronológico con DESEMPATE CAUSAL para timestamps idénticos (dos
  // transacciones distintas — producción vs venta/compra — pueden caer en el
  // mismo ms de now()). En un empate, el stock debe materializarse antes de
  // consumirse: ENTRADAS (0) → PRODUCCIONES (1) → CONSUMOS (2). Así una venta
  // del mismo instante ve el lote recién producido, y una producción ve el
  // insumo recién comprado. Sort estable → dentro de la misma fase se conserva
  // el orden de inserción (por id), preservando el comportamiento previo cuando
  // los timestamps son distintos.
  // Limitación conocida: DOS producciones en el MISMO ms donde una consume el
  // subproducto que la otra produce se ordenan solo por orden de inserción
  // (no hay orden topológico). Con producción manual de a una tanda es
  // impracticable en la operación real; si ocurriera, el costo de la
  // consumidora quedaría como unknownQty (nunca $0).
  const phaseOf = (e: Event): number => {
    if (e.kind === 'production') return 1;
    return e.m.delta > 0 ? 0 : 2;
  };
  events.sort((a, b) => {
    const dt = a.ts.getTime() - b.ts.getTime();
    return dt !== 0 ? dt : phaseOf(a) - phaseOf(b);
  });

  const queues = new Map<string, Lot[]>();
  // Para revertir consumo de venta al anular: key = `${saleId}:${stockableKey}`.
  const drawsBySource = new Map<string, Draw[]>();

  const out: LedgerFifo = {
    saleIngredientCost: new Map(),
    saleProductCost: new Map(),
    saleSubproductCost: new Map(),
    waste: [],
    cortesia: [],
    cortesiaCostBySource: new Map(),
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

  /**
   * Devuelve hasta `qty` unidades de los draws pendientes de `drawKey` —
   * lo más recién consumido primero (reverso FIFO)— re-inyectándolas al
   * FRENTE de la cola con su base de costo ORIGINAL. Compartido por el
   * reverso de venta (void/edición) y la anulación de cortesía.
   */
  const returnDraws = (
    drawKey: string,
    key: string,
    qty: number,
  ): { returnedCost: number; returnedUnknown: number; returnedQty: number } => {
    const draws = drawsBySource.get(drawKey) ?? [];
    let toReturn = qty;
    let returnedCost = 0;
    let returnedUnknown = 0;
    let returnedQty = 0;
    // Lotes a re-inyectar, en orden [más reciente … más viejo].
    const returnedLots: Lot[] = [];
    for (let i = draws.length - 1; i >= 0 && toReturn > 0; i--) {
      const d = draws[i]!;
      const ret = Math.min(d.qty, toReturn);
      if (ret <= 0) continue;
      returnedLots.push({
        movementId: d.movementId,
        qty: ret,
        unitCost: d.unitCost,
        createdAt: d.createdAt,
      });
      returnedQty += ret;
      if (d.unitCost === null) returnedUnknown += ret;
      else returnedCost += ret * d.unitCost;
      d.qty -= ret;
      toReturn -= ret;
    }
    // Descartar los draws ya agotados (desde el final) y actualizar el registro.
    while (draws.length > 0 && draws[draws.length - 1]!.qty <= 0) draws.pop();
    if (draws.length === 0) drawsBySource.delete(drawKey);
    else drawsBySource.set(drawKey, draws);
    // Re-inyectar al FRENTE: unshift en orden [más reciente … más viejo] deja
    // el más viejo primero en la cola (lo devuelto se consumió del frente, así
    // que es más viejo que el resto → preserva FIFO).
    const q = queues.get(key) ?? [];
    for (const lot of returnedLots) q.unshift(lot);
    queues.set(key, q);
    return { returnedCost, returnedUnknown, returnedQty };
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
        if (totalConsumedQty <= 0) {
          // Tanda sin consumos registrados (los insumos rondaron a 0 y se
          // filtraron, o datos incompletos): el costo real NO es $0 — lote
          // desconocido, NUNCA se asume gratis (auditoría 2026-07-05).
          addLot(posKey, { movementId: e.produces.id, qty: posQty, unitCost: null, createdAt: iso });
        } else if (totalUnknownQty <= 0) {
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

    // Reverso de consumo de venta (anulación o ajuste de edición): SALE con
    // delta > 0. Devuelve EXACTAMENTE `delta` unidades de los draws pendientes
    // de la venta —lo más recién consumido primero (reverso FIFO)—, reduce el
    // registro de draws y atribuye el costo negativo SOLO de lo devuelto.
    //
    // Antes devolvía TODOS los draws sin importar `delta` y borraba el registro:
    // correcto para una anulación total, pero corrompía una edición parcial
    // (devolvía de más) y dejaba al void sin draws para revertir. El void emite
    // UN reverso por stockable = neto consumido, así que `delta` nunca excede
    // los draws pendientes en el flujo normal (el cap es defensa ante el borde
    // unknownQty, igual que antes).
    if (m.type === 'SALE' && delta > 0) {
      const drawKey = `${m.sourceId ?? ''}:${key}`;
      const { returnedCost, returnedUnknown, returnedQty } = returnDraws(drawKey, key, delta);
      // Atribuir el reverso a la venta: cantidad y costo NEGATIVOS (un-consume).
      if (m.sourceId && returnedQty > 0) {
        const stockableId = key.slice(key.indexOf(':') + 1);
        attributeToSale(
          m.entityType,
          stockableId,
          m.sourceId,
          -roundCost(returnedCost),
          -returnedQty,
          -returnedUnknown,
        );
      }
      continue;
    }

    // Anulación de CORTESÍA: devuelve las unidades con su base de costo REAL
    // (los draws registrados al descontar la cortesía) y NETEA el costo de la
    // cortesía en los agregados. Antes el movimiento compensatorio entraba
    // como lote unitCost=null → esas unidades se vendían luego a costo $0
    // (subestimaba el COGS).
    //
    // El faltante (delta > draws devueltos) NO se re-inyecta — igual que el
    // reverso de void: el replay cubre TODA la historia, así que "sin draws"
    // significa que la cortesía consumió unidades FANTASMA (no había stock en
    // las colas). Re-inyectar el faltante crearía lotes fantasma y el
    // `remaining` del FIFO quedaría por encima del stock real de la DB
    // (auditoría 2026-07-05).
    if (m.sourceType === 'cortesia_reversal' && delta > 0) {
      const drawKey = `${m.sourceId ?? ''}:${key}`;
      const { returnedCost, returnedUnknown, returnedQty } = returnDraws(drawKey, key, delta);
      if (returnedQty > 0 && (returnedCost > 0 || returnedUnknown > 0)) {
        out.cortesia.push({
          createdAt: iso,
          cost: -roundCost(returnedCost),
          unknownQty: -roundCost(returnedUnknown),
        });
        if (m.sourceId) {
          const prev = out.cortesiaCostBySource.get(m.sourceId) ?? { cost: 0, unknownQty: 0 };
          prev.cost = roundCost(prev.cost - returnedCost);
          prev.unknownQty = roundCost(prev.unknownQty - returnedUnknown);
          out.cortesiaCostBySource.set(m.sourceId, prev);
        }
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
      // ACUMULAR los draws de este consumo (no sobrescribir): una venta puede
      // consumir el mismo stockable más de una vez (cobro inicial + ajuste por
      // edición que agrega producto). Sobrescribir perdía los draws previos →
      // el void no podía revertir el consumo completo.
      const drawKey = `${m.sourceId}:${key}`;
      const acc = drawsBySource.get(drawKey) ?? [];
      for (const d of draws) acc.push(d);
      drawsBySource.set(drawKey, acc);
      const stockableId = key.slice(key.indexOf(':') + 1);
      attributeToSale(m.entityType, stockableId, m.sourceId, cost, -delta, unknownQty);
    } else if (m.type === 'WASTE') {
      out.waste.push({ createdAt: iso, cost, unknownQty });
    } else if (m.sourceType === 'cortesia') {
      // Cortesía AUTORIZADA: producto regalado → costo FIFO real (no es venta
      // ni merma; se reporta aparte en el estado financiero). Los draws se
      // registran para que una ANULACIÓN devuelva la base de costo exacta.
      if (m.sourceId) {
        const drawKey = `${m.sourceId}:${key}`;
        const acc = drawsBySource.get(drawKey) ?? [];
        for (const d of draws) acc.push(d);
        drawsBySource.set(drawKey, acc);
      }
      out.cortesia.push({ createdAt: iso, cost, unknownQty });
      if (m.sourceId) {
        const prev = out.cortesiaCostBySource.get(m.sourceId) ?? { cost: 0, unknownQty: 0 };
        prev.cost = roundCost(prev.cost + cost);
        prev.unknownQty = roundCost(prev.unknownQty + unknownQty);
        out.cortesiaCostBySource.set(m.sourceId, prev);
      }
    }
    // Otro MANUAL_ADJUSTMENT- no se atribuye (sale del libro y listo).
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
