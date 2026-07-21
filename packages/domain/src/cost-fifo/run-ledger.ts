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
  /** Unidades cuyo costo NO se pudo determinar (nunca se asume $0). */
  unknownQty: number;
  /**
   * Unidades incluidas en `cost` con un costo ESTIMADO (último precio conocido),
   * no con su lote FIFO real: la venta consumió sin stock registrado. Se corrige
   * solo (baja a 0 y el costo pasa al real) cuando se registra la compra o la
   * producción que salda la deuda.
   *
   * Sirve para que los reportes puedan decir "X% de este COGS es estimado" en vez
   * de mostrar un margen exacto que no lo es.
   */
  estimatedQty: number;
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
  /** Estado FINAL serializable de las colas (para crear un LedgerSeed). */
  endingLots: Record<string, Lot[]>;
  /**
   * Último costo unitario conocido por stockable al final del replay. Se sirve
   * en el snapshot para que un faltante posterior al corte se pueda estimar sin
   * re-leer toda la historia.
   */
  endingLastKnownUnitCost: Record<string, number>;
  /**
   * Deudas de stock pendientes al final (inventario NEGATIVO): unidades que una
   * venta consumió sin lote disponible ("forzar disponible" / offline). La
   * PRÓXIMA entrada (compra/producción) las salda y su costo se atribuye
   * retroactivamente a la venta que las debe. Se sirven en el snapshot para que
   * una compra posterior al corte pueda saldar una deuda anterior a él.
   */
  endingDebts: Record<string, Debt[]>;
  /**
   * true = una REVERSA del replay incremental referencia un consumo ANTERIOR
   * al corte del seed (sus draws no existen acá) → este resultado es
   * incompleto y el servicio DEBE recomputar con replay completo.
   */
  needsFullReplay: boolean;
}

export interface Lot {
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

/**
 * Deuda de stock (inventario negativo): unidades que una venta consumió sin
 * lote. Guarda a QUÉ venta atribuir el costo cuando una entrada futura la salde.
 */
export interface Debt {
  qty: number;
  saleId: string;
  entityType: LedgerEntityType;
  createdAt: string;
  /**
   * Costo unitario ESTIMADO que la venta ya cargó por estas unidades (último
   * precio conocido al momento de vender). Al saldar la deuda, el costo real se
   * atribuye por DIFERENCIA (real − estimado) para no contar dos veces.
   * null = no había historial → la venta quedó en unknownQty.
   */
  estimatedUnitCost: number | null;
}

/**
 * SEMILLA de un snapshot del ledger (arquitectura de corte mensual): el estado
 * acumulado hasta un `cutoff`, para que el replay arranque desde ahí en vez de
 * desde el génesis. Serializable (se persiste como JSON en `ledger_snapshots`).
 *
 * Contiene lo que NO se puede reconstruir sin los movimientos previos:
 *  - `lots`: colas FIFO restantes por stockable al momento del corte.
 *  - `waste` / `cortesia`: valorizaciones históricas (los reportes filtran por
 *    fecha sobre estos arrays — sin la semilla, un P&G viejo perdería mermas).
 *  - `cortesiaCostBySource`: costo acumulado por solicitud de cortesía.
 *
 * Lo que NO contiene (a propósito): los costos POR VENTA pre-corte. Un reporte
 * cuyo rango empiece ANTES del corte debe usar replay completo (regla del
 * servicio) — las ventas viejas no cambian, así que ese caso es raro.
 */
export interface LedgerSeed {
  /** ISO del corte: el replay incremental procesa movimientos >= cutoff. */
  cutoffIso: string;
  lots: Record<string, Lot[]>;
  waste: { createdAt: string; cost: number; unknownQty: number }[];
  cortesia: { createdAt: string; cost: number; unknownQty: number }[];
  cortesiaCostBySource: Record<string, { cost: number; unknownQty: number }>;
  /** Deudas de stock (inventario negativo) pendientes al corte. Opcional para
   *  compat con snapshots viejos (default = sin deudas). */
  debts?: Record<string, Debt[]>;
  /** Último costo unitario conocido por stockable al corte — para estimar el
   *  faltante de una venta sin stock. Opcional (snapshots viejos). */
  lastKnownUnitCost?: Record<string, number>;
}

export interface LedgerOptions {
  /**
   * Costo unitario de respaldo por stockable (`${entityType}:${id}`), en unidad
   * de STOCK. Lo arma la API desde `lastUnitCost / conversionFactor` del
   * catálogo. Solo se usa para estimar un faltante cuando el replay todavía no
   * vio ninguna entrada de ese stockable (primera venta sin compras previas).
   * El historial del replay SIEMPRE tiene prioridad.
   */
  fallbackUnitCost?: Record<string, number>;
}

type Event =
  | { kind: 'single'; ts: Date; m: LedgerMovement }
  | { kind: 'production'; ts: Date; consumes: LedgerMovement[]; produces: LedgerMovement };

export function runLedgerFifo(
  movements: readonly LedgerMovement[],
  seed?: LedgerSeed,
  opts?: LedgerOptions,
): LedgerFifo {
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
  // Deudas de stock (inventario NEGATIVO) por stockable, en orden FIFO: la
  // entrada más vieja se salda primero. Solo las ventas crean deudas.
  const debts = new Map<string, Debt[]>();
  // Último costo unitario visto por stockable (de la última entrada con costo
  // conocido). Es la base del ESTIMADO cuando una venta consume sin stock.
  // Se deriva del propio replay → funciona igual para subproductos, que no
  // tienen columna de precio histórico (su costo sale de la producción).
  const lastKnownUnitCost = new Map<string, number>();
  // Para revertir consumo de venta al anular: key = `${saleId}:${stockableKey}`.
  // ACOTADO por pre-scan (mitigación de memoria, informe de calidad B1): los
  // draws solo se usan cuando llega una REVERSA (void/edición con delta>0, o
  // cortesia_reversal) — registrar los draws de TODAS las ventas históricas
  // retenía ~1M objetos en el pico del replay. Con el pre-scan, solo se
  // registran los de los sourceIds que efectivamente tienen reversas (un
  // puñado), y el pico de memoria deja de crecer con la historia de ventas.
  const reversedSources = new Set<string>();
  for (const m of movements) {
    if (!m.sourceId) continue;
    if ((m.type === 'SALE' && m.delta > 0) || m.sourceType === 'cortesia_reversal') {
      reversedSources.add(m.sourceId);
    }
  }
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
    endingLots: {},
    endingDebts: {},
    endingLastKnownUnitCost: {},
    needsFullReplay: false,
  };

  // Sembrar el estado del snapshot. Las colas se copian PROFUNDO (el replay
  // las muta); waste/cortesía históricos entran tal cual (los reportes filtran
  // por fecha sobre el array combinado).
  if (seed) {
    for (const [key, lots] of Object.entries(seed.lots)) {
      queues.set(
        key,
        lots.map((l) => ({ ...l })),
      );
    }
    out.waste.push(...seed.waste.map((w) => ({ ...w })));
    out.cortesia.push(...seed.cortesia.map((c) => ({ ...c })));
    for (const [sourceId, v] of Object.entries(seed.cortesiaCostBySource)) {
      out.cortesiaCostBySource.set(sourceId, { ...v });
    }
    // Deudas pendientes al corte (opcional en snapshots viejos): una compra
    // posterior al corte puede saldar una deuda anterior a él.
    for (const [key, ds] of Object.entries(seed.debts ?? {})) {
      debts.set(
        key,
        ds.map((d) => ({ ...d })),
      );
    }
    for (const [key, c] of Object.entries(seed.lastKnownUnitCost ?? {})) {
      lastKnownUnitCost.set(key, c);
    }
  }

  /**
   * Costo unitario para ESTIMAR un faltante: lo último que vimos en el replay y,
   * si el stockable nunca tuvo una entrada, el respaldo del catálogo.
   * null = sin historial → la venta queda en unknownQty (nunca se asume $0).
   */
  const estimateFor = (key: string): number | null =>
    lastKnownUnitCost.get(key) ?? opts?.fallbackUnitCost?.[key] ?? null;

  // Detección de reversa que CRUZA el corte (modo incremental): si una reversa
  // no logra devolver TODA su cantidad desde los draws de esta ventana, el
  // consumo original ocurrió antes del corte (total o parcialmente — p.ej.
  // venta cobrada en el mes M, editada y anulada en M+1) → este resultado es
  // incompleto y el servicio debe recomputar con replay completo. Epsilon por
  // acumulación de flotantes en draws fraccionarios.
  const flagIfCrossCutoff = (returnedQty: number, requestedQty: number): void => {
    if (seed && returnedQty < requestedQty - 1e-9) out.needsFullReplay = true;
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
    estimatedQty = 0,
  ): void => {
    const t = targetMap(et);
    const bySale = t.get(saleId) ?? new Map<string, CostQty>();
    const prev = bySale.get(stockableId) ?? { cost: 0, qty: 0, unknownQty: 0, estimatedQty: 0 };
    prev.cost += cost;
    prev.qty += qty;
    prev.unknownQty += unknownQty;
    prev.estimatedQty += estimatedQty;
    bySale.set(stockableId, prev);
    t.set(saleId, bySale);
  };

  /**
   * Consume FIFO de la cola del stockable.
   *
   * `unknownQty` = unidades tomadas de lotes SIN costo conocido.
   * `shortfall`  = unidades que NO había en stock (inventario negativo).
   * Los dos son "sin costo" pero se devuelven SEPARADOS: el faltante de una
   * venta se ESTIMA al último precio conocido y se registra como deuda; los
   * demás callers (producción/merma/cortesía) lo suman a unknownQty.
   */
  const consumeFifo = (
    key: string,
    qtyNeeded: number,
  ): { cost: number; unknownQty: number; draws: Draw[]; shortfall: number } => {
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
    const shortfall = remaining > 0 ? remaining : 0;
    queues.set(key, q);
    return {
      cost: roundCost(cost),
      unknownQty: roundCost(unknownQty),
      draws,
      shortfall: roundCost(shortfall),
    };
  };

  /**
   * Agrega un lote. Si el stockable tiene DEUDA pendiente (inventario negativo
   * por ventas forzadas/offline), el lote la salda PRIMERO —FIFO, la más vieja—
   * y su costo se atribuye RETROACTIVAMENTE a la venta que la debe. Recién el
   * remanente queda disponible como stock. Así el replay corrige solo el costo
   * de la venta forzada en cuanto se registra el inventario (compra/producción).
   */
  const addLot = (key: string, lot: Lot): void => {
    // Base del estimado para futuros faltantes de este stockable.
    if (lot.unitCost !== null) lastKnownUnitCost.set(key, lot.unitCost);
    let incoming = lot.qty;
    const ds = debts.get(key);
    if (ds && ds.length > 0 && incoming > 0) {
      const stockableId = key.slice(key.indexOf(':') + 1);
      while (ds.length > 0 && incoming > 1e-9) {
        const d = ds[0]!;
        const fill = Math.min(incoming, d.qty);
        if (lot.unitCost !== null) {
          // Salda la deuda con el costo REAL. Si la venta ya había cargado un
          // ESTIMADO, se atribuye solo la DIFERENCIA (real − estimado): sumar
          // el real completo contaría el insumo dos veces.
          const already = d.estimatedUnitCost ?? 0;
          const delta = roundCost(fill * (lot.unitCost - already));
          attributeToSale(
            d.entityType,
            stockableId,
            d.saleId,
            delta,
            0,
            // Si estaba estimado, su unknownQty ya era 0; si no, se resuelve ahora.
            d.estimatedUnitCost !== null ? 0 : -fill,
            // El estimado deja de serlo: ahora es costo real.
            d.estimatedUnitCost !== null ? -fill : 0,
          );
          // Registrar un draw en la venta para que un void POSTERIOR lo revierta.
          if (reversedSources.has(d.saleId)) {
            const drawKey = `${d.saleId}:${key}`;
            const acc = drawsBySource.get(drawKey) ?? [];
            acc.push({ qty: fill, unitCost: lot.unitCost, movementId: lot.movementId, createdAt: lot.createdAt });
            drawsBySource.set(drawKey, acc);
          }
        } else if (reversedSources.has(d.saleId)) {
          // §1.6: lote de costo DESCONOCIDO saldando la deuda (cold start con
          // INITIAL sin costo, producción sin costo). El costo de la venta NO
          // cambia (sigue estimado/desconocido — honesto), pero IGUAL hay que
          // registrar el draw para que un void POSTERIOR re-inyecte estas
          // unidades: antes no se registraba y la valuación las perdía para
          // siempre. El draw lleva lo que la venta CARGÓ (el estimado, o null si
          // era desconocida) ⇒ el void netea su costo a 0 y devuelve las unidades.
          const drawKey = `${d.saleId}:${key}`;
          const acc = drawsBySource.get(drawKey) ?? [];
          acc.push({ qty: fill, unitCost: d.estimatedUnitCost, movementId: lot.movementId, createdAt: lot.createdAt });
          drawsBySource.set(drawKey, acc);
        }
        // Lote de costo desconocido: salda físicamente la deuda pero el costo de
        // la venta sigue como estaba (estimado o desconocido — honesto).
        d.qty -= fill;
        incoming -= fill;
        if (d.qty <= 1e-9) ds.shift();
      }
      if (ds.length === 0) debts.delete(key);
      else debts.set(key, ds);
    }
    if (incoming > 1e-9) {
      const q = queues.get(key) ?? [];
      q.push(incoming === lot.qty ? lot : { ...lot, qty: roundCost(incoming) });
      queues.set(key, q);
    }
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

  /**
   * Cancela hasta `qty` unidades de DEUDA de `saleId` en `key` (al anular una
   * venta forzada cuya deuda aún NO se saldó). Devuelve exactamente qué cargó
   * la venta por esas unidades, para que el void lo revierta sin residuos:
   * el costo ESTIMADO si lo hubo, o el unknownQty si no había historial.
   */
  const cancelDebt = (
    key: string,
    saleId: string,
    qty: number,
  ): { qty: number; cost: number; unknownQty: number; estimatedQty: number } => {
    const out = { qty: 0, cost: 0, unknownQty: 0, estimatedQty: 0 };
    const ds = debts.get(key);
    if (!ds || ds.length === 0) return out;
    let toCancel = qty;
    for (const d of ds) {
      if (toCancel <= 1e-9) break;
      if (d.saleId !== saleId) continue;
      const take = Math.min(d.qty, toCancel);
      if (take <= 0) continue;
      d.qty -= take;
      toCancel -= take;
      out.qty += take;
      if (d.estimatedUnitCost !== null) {
        out.cost += take * d.estimatedUnitCost;
        out.estimatedQty += take;
      } else {
        out.unknownQty += take;
      }
    }
    const kept = ds.filter((d) => d.qty > 1e-9);
    if (kept.length === 0) debts.delete(key);
    else debts.set(key, kept);
    out.cost = roundCost(out.cost);
    return out;
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
        const { cost, unknownQty, shortfall } = consumeFifo(cKey, Math.abs(c.delta));
        totalCost += cost;
        // La producción NO estima ni crea deuda (solo las ventas): su faltante
        // sigue siendo costo desconocido, como hasta ahora.
        totalUnknownQty += unknownQty + shortfall;
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
      // El sobrante (delta > draws devueltos) que quede es DEUDA aún no saldada
      // de esta venta forzada: se cancela (las unidades fantasma nunca se
      // consumieron realmente) y se revierte su unknownQty provisional.
      const leftover = delta - returnedQty;
      const cancelled =
        leftover > 1e-9 && m.sourceId
          ? cancelDebt(key, m.sourceId, leftover)
          : { qty: 0, cost: 0, unknownQty: 0, estimatedQty: 0 };
      flagIfCrossCutoff(returnedQty + cancelled.qty, delta);
      // Atribuir el reverso a la venta: cantidad y costo NEGATIVOS (un-consume).
      if (m.sourceId && (returnedQty > 0 || cancelled.qty > 0)) {
        const stockableId = key.slice(key.indexOf(':') + 1);
        attributeToSale(
          m.entityType,
          stockableId,
          m.sourceId,
          -roundCost(returnedCost + cancelled.cost),
          -(returnedQty + cancelled.qty),
          -(returnedUnknown + cancelled.unknownQty),
          -cancelled.estimatedQty,
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
      flagIfCrossCutoff(returnedQty, delta);
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
    const { cost, unknownQty, draws, shortfall } = consumeFifo(key, -delta);
    if (m.type === 'SALE' && m.sourceId) {
      // Faltante de stock (venta forzada / offline / consumible): se ESTIMA al
      // último precio conocido para que la venta tenga un costo razonable ya, y
      // queda como DEUDA para que la próxima entrada lo corrija al costo REAL.
      // Sin historial → unknownQty (nunca se asume $0).
      let estimatedCost = 0;
      let estimatedQty = 0;
      let extraUnknown = 0;
      if (shortfall > 1e-9) {
        const unitEstimate = estimateFor(key);
        if (unitEstimate !== null) {
          estimatedCost = roundCost(shortfall * unitEstimate);
          estimatedQty = shortfall;
        } else {
          extraUnknown = shortfall;
        }
        const ds = debts.get(key) ?? [];
        ds.push({
          qty: shortfall,
          saleId: m.sourceId,
          entityType: m.entityType,
          createdAt: iso,
          estimatedUnitCost: unitEstimate,
        });
        debts.set(key, ds);
      }
      // ACUMULAR los draws de este consumo (no sobrescribir): una venta puede
      // consumir el mismo stockable más de una vez (cobro inicial + ajuste por
      // edición que agrega producto). Sobrescribir perdía los draws previos →
      // el void no podía revertir el consumo completo.
      if (reversedSources.has(m.sourceId)) {
        const drawKey = `${m.sourceId}:${key}`;
        const acc = drawsBySource.get(drawKey) ?? [];
        for (const d of draws) acc.push(d);
        drawsBySource.set(drawKey, acc);
      }
      const stockableId = key.slice(key.indexOf(':') + 1);
      attributeToSale(
        m.entityType,
        stockableId,
        m.sourceId,
        roundCost(cost + estimatedCost),
        -delta,
        roundCost(unknownQty + extraUnknown),
        estimatedQty,
      );
    } else if (m.type === 'WASTE') {
      // Merma/cortesía no estiman ni crean deuda: su faltante sigue desconocido.
      out.waste.push({ createdAt: iso, cost, unknownQty: roundCost(unknownQty + shortfall) });
    } else if (m.sourceType === 'cortesia') {
      // Cortesía AUTORIZADA: producto regalado → costo FIFO real (no es venta
      // ni merma; se reporta aparte en el estado financiero). Los draws se
      // registran para que una ANULACIÓN devuelva la base de costo exacta.
      if (m.sourceId && reversedSources.has(m.sourceId)) {
        const drawKey = `${m.sourceId}:${key}`;
        const acc = drawsBySource.get(drawKey) ?? [];
        for (const d of draws) acc.push(d);
        drawsBySource.set(drawKey, acc);
      }
      const cortesiaUnknown = roundCost(unknownQty + shortfall);
      out.cortesia.push({ createdAt: iso, cost, unknownQty: cortesiaUnknown });
      if (m.sourceId) {
        const prev = out.cortesiaCostBySource.get(m.sourceId) ?? { cost: 0, unknownQty: 0 };
        prev.cost = roundCost(prev.cost + cost);
        prev.unknownQty = roundCost(prev.unknownQty + cortesiaUnknown);
        out.cortesiaCostBySource.set(m.sourceId, prev);
      }
    }
    // Otro MANUAL_ADJUSTMENT- no se atribuye (sale del libro y listo).
  }

  // Construir remaining + remainingLots + endingLots (estado serializable
  // para snapshot) a partir del estado final de cada cola.
  for (const [key, q] of queues) {
    let value = 0;
    let unknownQty = 0;
    let qty = 0;
    const lots: { qty: number; unitCost: number | null }[] = [];
    const ending: Lot[] = [];
    for (const l of q) {
      if (l.qty <= 0) continue;
      qty += l.qty;
      if (l.unitCost === null) unknownQty += l.qty;
      else value += l.qty * l.unitCost;
      lots.push({ qty: roundCost(l.qty), unitCost: l.unitCost });
      ending.push({
        movementId: l.movementId,
        qty: roundCost(l.qty),
        unitCost: l.unitCost,
        createdAt: l.createdAt,
      });
    }
    out.remaining.set(key, {
      qty: roundCost(qty),
      value: roundCost(value),
      unknownQty: roundCost(unknownQty),
    });
    if (lots.length > 0) out.remainingLots.set(key, lots);
    if (ending.length > 0) out.endingLots[key] = ending;
  }
  // Deudas pendientes → estado serializable para el snapshot.
  for (const [key, ds] of debts) {
    const kept = ds.filter((d) => d.qty > 1e-9).map((d) => ({ ...d, qty: roundCost(d.qty) }));
    if (kept.length > 0) out.endingDebts[key] = kept;
  }
  for (const [key, c] of lastKnownUnitCost) out.endingLastKnownUnitCost[key] = c;
  return out;
}

/**
 * Arma la SEMILLA serializable a partir de un replay COMPLETO cuyo último
 * movimiento es anterior a `cutoffIso`. El servicio la persiste como JSON y
 * los replays posteriores arrancan desde ahí con solo los movimientos nuevos.
 */
export function buildLedgerSeed(fifo: LedgerFifo, cutoffIso: string): LedgerSeed {
  return {
    cutoffIso,
    lots: fifo.endingLots,
    waste: fifo.waste,
    cortesia: fifo.cortesia,
    cortesiaCostBySource: Object.fromEntries(fifo.cortesiaCostBySource),
    debts: fifo.endingDebts,
    lastKnownUnitCost: fifo.endingLastKnownUnitCost,
  };
}
