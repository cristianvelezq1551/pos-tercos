/**
 * Generador de HISTORIAS de inventario para las pruebas de propiedad del FIFO.
 *
 * Produce secuencias aleatorias pero BIEN FORMADAS: las mismas que puede
 * generar la app real. En concreto:
 *  - Las reversas nunca devuelven más de lo que su origen consumió (la API lo
 *    capa: `reverseWaste` valida contra lo pendiente, el void emite el neto).
 *  - Merma y cortesías no consumen más de lo que hay (la app las valida).
 *  - Las VENTAS sí pueden dejar el stock en negativo (productos "forzados
 *    disponibles" y ventas offline) — es el caso interesante, se conserva.
 *
 * Generar historias imposibles solo probaría que la función aguanta basura;
 * lo que interesa es que las leyes se cumplan sobre lo que de verdad ocurre.
 */

import type { LedgerMovement } from '../cost-fifo/run-ledger';
import type { Rng } from './random';

export interface HistoryOptions {
  /** Cuántos movimientos generar (aprox: una tanda de producción cuenta varios). */
  steps: number;
  /** Permitir ventas que dejan el stock negativo (deudas). */
  allowShortfall: boolean;
  /** Permitir entradas SIN costo conocido (cold start, producción sin costo). */
  allowUnknownCost: boolean;
  /** Incluir tandas de producción (insumos → subproducto). */
  includeProduction: boolean;
  /**
   * Emitir ajustes manuales SUELTOS (sin `sourceType`), que el ledger no
   * atribuye a ninguna línea. Apagado por defecto: un ajuste así rompe la
   * conservación del valor A PROPÓSITO —corrige una entrada mal cargada, no
   * declara una pérdida— y dejaría las leyes de conservación midiendo un
   * fenómeno que no es un error. Se prende solo en el test de esa distinción.
   */
  includeCorrections?: boolean;
  /**
   * Emitir COMPRAS ANULADAS: una entrada y, pegado a ella, el movimiento que la
   * deshace. Es como las escribe la app (la reversa lleva la fecha del
   * original), así que el replay la ve antes de que nadie consumiera el lote.
   *
   * Interesa sobre todo cuando el stockable está en NEGATIVO: ahí la entrada no
   * queda en la cola —salda deudas— y anularla obliga a devolver la deuda y a
   * desatribuirle el costo al consumo que la debía.
   */
  includeVoidedPurchases?: boolean;
}

export interface GeneratedHistory {
  movements: LedgerMovement[];
  /** Suma de `qty × unitCost` de todo lo que ENTRÓ con costo conocido. */
  valueIn: number;
  /** Unidades que entraron SIN costo conocido. Se rastrean aparte para poder
   *  exigir que el replay las siga declarando desconocidas en vez de valuarlas
   *  en $0 (que es lo mismo que regalar el insumo en el P&G). */
  unknownUnitsIn: number;
  /** Claves `TYPE:id` que participaron. */
  keys: string[];
}

interface Entity {
  key: string;
  entityType: 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';
  id: string;
  /** Stock en la sombra, para no generar consumos imposibles. */
  stock: number;
}

/** Consumo pasado, para poder emitir una reversa acotada a lo que consumió. */
interface PastConsumption {
  kind: 'sale' | 'waste' | 'cortesia';
  sourceId: string;
  /** El id del MOVIMIENTO en la merma (su reversa apunta al movimiento). */
  movementId: string;
  entity: Entity;
  qty: number;
  reversedQty: number;
}

export function generateHistory(rng: Rng, opts: HistoryOptions): GeneratedHistory {
  const entities: Entity[] = [
    { key: 'INGREDIENT:ing-1', entityType: 'INGREDIENT', id: 'ing-1', stock: 0 },
    { key: 'INGREDIENT:ing-2', entityType: 'INGREDIENT', id: 'ing-2', stock: 0 },
    { key: 'PRODUCT:prod-1', entityType: 'PRODUCT', id: 'prod-1', stock: 0 },
  ];
  const subproduct: Entity = {
    key: 'SUBPRODUCT:sub-1',
    entityType: 'SUBPRODUCT',
    id: 'sub-1',
    stock: 0,
  };
  if (opts.includeProduction) entities.push(subproduct);

  const movements: LedgerMovement[] = [];
  const past: PastConsumption[] = [];
  let valueIn = 0;
  let unknownUnitsIn = 0;
  let seq = 0;
  // Timestamps estrictamente crecientes: la precondición del replay.
  let t = Date.UTC(2026, 0, 1, 8, 0, 0);
  const nextAt = (): Date => {
    t += 60_000;
    return new Date(t);
  };
  const nextId = (): string => `mov-${String(++seq).padStart(4, '0')}`;

  const push = (m: Omit<LedgerMovement, 'id' | 'createdAt'> & { id?: string; createdAt?: Date }): LedgerMovement => {
    const full: LedgerMovement = {
      id: m.id ?? nextId(),
      createdAt: m.createdAt ?? nextAt(),
      delta: m.delta,
      type: m.type,
      unitCost: m.unitCost,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      entityType: m.entityType,
      ingredientId: m.ingredientId,
      productId: m.productId,
      subproductId: m.subproductId,
    };
    movements.push(full);
    return full;
  };

  const refs = (e: Entity) => ({
    entityType: e.entityType,
    ingredientId: e.entityType === 'INGREDIENT' ? e.id : null,
    productId: e.entityType === 'PRODUCT' ? e.id : null,
    subproductId: e.entityType === 'SUBPRODUCT' ? e.id : null,
  });

  /** Entrada de stock con (o sin) costo conocido. */
  const emitEntry = (e: Entity): void => {
    const qty = rng.int(10, 200);
    const unitCost = opts.allowUnknownCost && rng.chance(0.15) ? null : rng.int(1, 50);
    e.stock += qty;
    if (unitCost !== null) valueIn += qty * unitCost;
    else unknownUnitsIn += qty;
    push({
      delta: qty,
      type: rng.chance(0.3) ? 'INITIAL' : 'PURCHASE',
      unitCost,
      sourceType: null,
      sourceId: null,
      ...refs(e),
    });
  };

  /** Consumo por venta. Puede exceder el stock si `allowShortfall`. */
  const emitSale = (e: Entity): void => {
    const max = opts.allowShortfall ? e.stock + rng.int(0, 40) : e.stock;
    if (max <= 0) return;
    const qty = rng.int(1, Math.max(1, Math.floor(max)));
    const saleId = `sale-${rng.int(1, 40)}`;
    e.stock -= qty;
    const mov = push({
      delta: -qty,
      type: 'SALE',
      unitCost: null,
      sourceType: null,
      sourceId: saleId,
      ...refs(e),
    });
    past.push({ kind: 'sale', sourceId: saleId, movementId: mov.id, entity: e, qty, reversedQty: 0 });
  };

  /** Merma. Puede exceder el stock si `allowShortfall`: el inventario ya venía
   *  en negativo por ventas forzadas y el cocinero igual tiró producto. */
  const emitWaste = (e: Entity): void => {
    const max = opts.allowShortfall ? e.stock + rng.int(0, 10) : e.stock;
    if (max <= 0) return;
    const qty = rng.int(1, Math.max(1, Math.floor(max)));
    e.stock -= qty;
    const mov = push({
      delta: -qty,
      type: 'WASTE',
      unitCost: null,
      sourceType: null,
      sourceId: null,
      ...refs(e),
    });
    past.push({ kind: 'waste', sourceId: mov.id, movementId: mov.id, entity: e, qty, reversedQty: 0 });
  };

  /** Cortesía autorizada: consumo con su propio `sourceType`. También puede
   *  quedar sin lote (el dueño regala con el inventario en negativo). */
  const emitCortesia = (e: Entity): void => {
    const max = opts.allowShortfall ? e.stock + rng.int(0, 10) : e.stock;
    if (max <= 0) return;
    const qty = rng.int(1, Math.max(1, Math.floor(max)));
    const cortesiaId = `cort-${rng.int(1, 20)}`;
    e.stock -= qty;
    const mov = push({
      delta: -qty,
      type: 'MANUAL_ADJUSTMENT',
      unitCost: null,
      sourceType: 'cortesia',
      sourceId: cortesiaId,
      ...refs(e),
    });
    past.push({ kind: 'cortesia', sourceId: cortesiaId, movementId: mov.id, entity: e, qty, reversedQty: 0 });
  };

  /**
   * Faltante de conteo: al contar físicamente hay menos de lo que dicen los
   * libros. Es un ajuste negativo con `sourceType='stock_count'`, y a
   * diferencia de un ajuste manual suelto SÍ es una pérdida a reportar.
   * También puede caer sobre inventario ya en negativo.
   */
  const emitFaltante = (e: Entity): void => {
    const max = opts.allowShortfall ? e.stock + rng.int(0, 10) : e.stock;
    if (max <= 0) return;
    const qty = rng.int(1, Math.max(1, Math.floor(max)));
    e.stock -= qty;
    push({
      delta: -qty,
      type: 'MANUAL_ADJUSTMENT',
      unitCost: null,
      sourceType: 'stock_count',
      sourceId: `conteo-${rng.int(1, 20)}`,
      ...refs(e),
    });
  };

  /**
   * Conteo que encuentra DE MÁS. Deshace faltantes previos de ese item (les
   * devuelve su costo) y, si sobra, entra como inventario sin costo conocido.
   * Sin esto, el camino de vuelta del faltante no se ejercitaría en ninguna ley.
   */
  const emitSobra = (e: Entity): void => {
    const qty = rng.int(1, 12);
    e.stock += qty;
    push({
      delta: qty,
      type: 'MANUAL_ADJUSTMENT',
      unitCost: null,
      sourceType: 'stock_count',
      sourceId: `conteo-${rng.int(1, 20)}`,
      ...refs(e),
    });
  };

  /**
   * Ajuste manual suelto (sin `sourceType`): el admin corrige un dato mal
   * cargado. NO es pérdida — sale del libro sin atribuirse. Está acá para que
   * las leyes distingan los dos casos en vez de asumir que todo ajuste
   * negativo es lo mismo.
   */
  const emitCorreccion = (e: Entity): void => {
    if (e.stock <= 0) return;
    const qty = rng.int(1, Math.max(1, Math.floor(e.stock)));
    e.stock -= qty;
    push({
      delta: -qty,
      type: 'MANUAL_ADJUSTMENT',
      unitCost: null,
      sourceType: null,
      sourceId: null,
      ...refs(e),
    });
  };

  /**
   * Compra que se anula: entrada + su reversa, ambas con la misma fecha. El
   * stock de la sombra no cambia — que es justamente la ley.
   */
  const emitVoidedPurchase = (e: Entity): void => {
    const qty = rng.int(10, 200);
    const unitCost = opts.allowUnknownCost && rng.chance(0.15) ? null : rng.int(1, 50);
    const at = nextAt();
    const entrada = push({
      createdAt: at,
      delta: qty,
      type: 'PURCHASE',
      unitCost,
      sourceType: 'invoice',
      sourceId: `inv-${nextId()}`,
      ...refs(e),
    });
    push({
      createdAt: at,
      delta: -qty,
      type: 'PURCHASE',
      unitCost: null,
      sourceType: 'invoice_reversal',
      sourceId: entrada.id,
      ...refs(e),
    });
  };

  /** Reversa acotada a lo que su origen consumió y aún no devolvió. */
  const emitReversal = (): void => {
    const candidates = past.filter((p) => p.qty - p.reversedQty > 0);
    if (candidates.length === 0) return;
    const target = rng.pick(candidates);
    const pending = target.qty - target.reversedQty;
    const qty = rng.int(1, Math.floor(pending));
    target.reversedQty += qty;
    target.entity.stock += qty;
    const common = { delta: qty, unitCost: null, ...refs(target.entity) };
    if (target.kind === 'sale') {
      push({ ...common, type: 'SALE', sourceType: null, sourceId: target.sourceId });
    } else if (target.kind === 'waste') {
      push({ ...common, type: 'MANUAL_ADJUSTMENT', sourceType: 'waste_reversal', sourceId: target.movementId });
    } else {
      push({ ...common, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia_reversal', sourceId: target.sourceId });
    }
  };

  /** Tanda: consume insumos y materializa N unidades del subproducto. Con
   *  `allowShortfall` puede consumir insumo que no estaba cargado (la cocina
   *  produjo con lo que había físicamente y la compra no se registró). */
  const emitProduction = (): void => {
    const inputs = entities.filter(
      (e) => e.entityType === 'INGREDIENT' && (opts.allowShortfall || e.stock > 0),
    );
    if (inputs.length === 0) return;
    const runId = `prod-${nextId()}`;
    const at = nextAt();
    for (const input of inputs) {
      const max = opts.allowShortfall ? input.stock + rng.int(0, 10) : input.stock;
      if (max <= 0) continue;
      const qty = rng.int(1, Math.max(1, Math.floor(max)));
      input.stock -= qty;
      push({
        createdAt: at,
        delta: -qty,
        type: 'PRODUCTION',
        unitCost: null,
        sourceType: 'production',
        sourceId: runId,
        ...refs(input),
      });
    }
    const produced = rng.int(1, 30);
    subproduct.stock += produced;
    push({
      createdAt: at,
      delta: produced,
      type: 'PRODUCTION',
      unitCost: null,
      sourceType: 'production',
      sourceId: runId,
      ...refs(subproduct),
    });
  };

  // Arrancar con stock para que los consumos tengan de dónde salir.
  for (const e of entities) if (e.entityType !== 'SUBPRODUCT') emitEntry(e);

  for (let i = 0; i < opts.steps; i++) {
    const roll = rng.float(0, 1);
    const target = rng.pick(entities);
    if (roll < 0.28) emitEntry(target);
    else if (roll < 0.56) emitSale(target);
    else if (roll < 0.66) emitWaste(target);
    else if (roll < 0.74) emitCortesia(target);
    else if (roll < 0.78) emitFaltante(target);
    else if (roll < 0.8) emitSobra(target);
    else if (roll < 0.84 && opts.includeCorrections) emitCorreccion(target);
    else if (roll < 0.88 && opts.includeVoidedPurchases) emitVoidedPurchase(target);
    else if (roll < 0.94) emitReversal();
    else if (opts.includeProduction) emitProduction();
    else emitEntry(target);
  }

  return {
    movements,
    valueIn,
    unknownUnitsIn,
    keys: [...entities.map((e) => e.key), subproduct.key],
  };
}
