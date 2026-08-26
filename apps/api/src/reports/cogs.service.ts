import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import {
  buildLedgerSeed,
  expandRecipeOneLevel,
  runLedgerFifo,
  type CostQty,
  type LedgerFifo,
  type LedgerMovement,
  type LedgerSeed,
  type ParentRef,
  type RecipeGraph,
} from '@pos-tercos/domain';
import {
  NON_REVENUE_SALE_STATUSES,
  REFUND_VOID_REASON_PREFIX,
  type FifoLotsResponse,
  type InventoryValuationReport,
  type PnlReport,
  type ProductMargin,
  type ProductMarginReport,
} from '@pos-tercos/types';
import { ymdLocal } from '../common/local-dates';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';

// Fuente única en @pos-tercos/types: CANCELADO_SIN_REEMBOLSO sí es ingreso (no está acá).
const EXCLUDED_STATUSES = NON_REVENUE_SALE_STATUSES;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class CogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipesService,
  ) {}

  private readonly logger = new Logger(CogsService.name);

  // ==================================================================
  // Replay FIFO del ledger — la lógica vive en @pos-tercos/domain
  // (runLedgerFifo, pura y testeada). Acá cargamos los movimientos ordenados,
  // los mapeamos a datos planos y decidimos DESDE DÓNDE arranca el replay:
  //
  //   ARQUITECTURA DE SNAPSHOT (2026-07-06 — cierra el B1 del informe de
  //   calidad): sin snapshot, cada reporte re-procesaba TODA la historia de
  //   inventory_movements (O(n) creciente para siempre → a 12-18 meses el
  //   replay congelaba el event loop que también cobra las ventas). Con el
  //   snapshot mensual, el replay habitual procesa SOLO el mes corriente.
  //
  //   Reglas de corrección (validadas por tests de equivalencia en domain):
  //   1. El seed lleva lotes restantes + waste/cortesía históricos + costo por
  //      cortesía → valuación, lotes y cortesías son EXACTOS en incremental.
  //   2. Los costos POR VENTA pre-corte NO están en el incremental → un
  //      reporte usa el snapshot MÁS NUEVO cuyo corte sea <= el inicio de su
  //      rango (`rangeFrom`). Como los snapshots de todos los meses quedan
  //      guardados, los reportes históricos también corren incrementales; solo
  //      cae a replay completo lo anterior al PRIMER corte.
  //   3. Una reversa (void/edición/anulación de cortesía) que cruza el corte
  //      enciende `needsFullReplay` → fallback automático a replay completo.
  //      Nunca hay resultado incorrecto, solo uno más lento.
  // ==================================================================

  /**
   * Caché del ledger con TTL corto, una entrada por corte usado (`full` o
   * `inc:<corte>`).
   * Memoizar la PROMESA deduplica llamados concurrentes. Sin invalidación por
   * escritura a propósito: un reporte de COGS tolera ≤ TTL de staleness.
   */
  private static readonly LEDGER_TTL_MS = 60_000;
  private ledgerCache = new Map<string, { promise: Promise<LedgerFifo>; at: number }>();

  /** Limpia la caché (tras crear un snapshot, y para tests). */
  invalidateLedgerCache(): void {
    this.ledgerCache.clear();
  }

  /**
   * @param rangeFrom fecha MÁS TEMPRANA cuyas ventas va a costear el caller.
   *   Si el snapshot vigente corta después de esa fecha, el incremental no
   *   tendría los costos de esas ventas → replay completo. Sin `rangeFrom`
   *   (valuación, lotes, cortesías) el incremental siempre sirve: el seed
   *   preserva lotes y agregados históricos completos.
   */
  private async runLedger(rangeFrom?: Date): Promise<LedgerFifo> {
    // ⚠️ Qué snapshot se usa se resuelve ANTES de tocar la caché, y la clave de
    // la caché lleva SU CORTE. Con una sola entrada de "incremental", un
    // cache-hit de otro caller (p.ej. la valuación, que llama sin rango y usa
    // el corte más nuevo) le devolvería ese resultado a un reporte histórico
    // que necesita un corte anterior → COGS de las ventas pre-corte en $0
    // (margen inflado). El corte en la clave hace imposible ese cruce.
    const snapshot = await this.pickSnapshot(rangeFrom);
    if (!snapshot) {
      // Sin snapshot que cubra el rango (historia anterior al primer corte).
      return this.fullLedger();
    }
    const incremental = await this.cachedLedger(
      `inc:${snapshot.cutoffAt.toISOString()}`,
      () => this.computeLedger(snapshot),
    );
    if (incremental.needsFullReplay) {
      // Reversa cruzó el corte (void de una venta del mes pasado): el
      // incremental es incompleto. Recomputar completo — correcto siempre.
      this.logger.warn(
        `Reversa cruza el corte del snapshot (${snapshot.cutoffAt.toISOString()}) → replay completo`,
      );
      return this.fullLedger();
    }
    return incremental;
  }

  /**
   * Costo FIFO de cada merma, indexado por id del movimiento y ya neteado por
   * sus anulaciones. `from` acota el replay: pedir un rango anterior al último
   * corte cae en replay completo, así que el índice siempre cubre lo pedido.
   */
  async getWasteCostByMovement(
    from: Date,
  ): Promise<Map<string, { cost: number; unknownQty: number; estimatedCost: number }>> {
    const ledger = await this.runLedger(from);
    return ledger.wasteCostByMovement;
  }

  /** Replay completo (sin seed), con su propia entrada de caché. */
  private fullLedger(): Promise<LedgerFifo> {
    return this.cachedLedger('full', () => this.computeLedger(null));
  }

  /** `key` = 'full' o `inc:<corte ISO>` — ver la nota de `runLedger`. */
  private cachedLedger(
    mode: string,
    compute: () => Promise<LedgerFifo>,
  ): Promise<LedgerFifo> {
    const now = Date.now();
    const hit = this.ledgerCache.get(mode);
    if (hit && now - hit.at < CogsService.LEDGER_TTL_MS) return hit.promise;
    const promise = compute();
    this.ledgerCache.set(mode, { promise, at: now });
    // No cachear un error: si falla, limpiar para reintentar en el próximo call.
    void promise.catch(() => {
      if (this.ledgerCache.get(mode)?.promise === promise) this.ledgerCache.delete(mode);
    });
    return promise;
  }

  /**
   * Snapshot MÁS NUEVO que sirve para costear ventas desde `rangeFrom`.
   *
   * Los snapshots de todos los meses quedan guardados (nunca se borran), pero
   * antes solo se miraba el último: cualquier reporte histórico (el P&G del mes
   * pasado, la tendencia de 6 meses) tenía su rango ANTES de ese corte y caía a
   * replay completo desde el génesis, aunque existiera un snapshot justo de esa
   * época. Eligiendo el corte que cubre el rango, esos reportes también corren
   * incrementales.
   *
   * Sin `rangeFrom` (valuación, lotes, cortesías) sirve el último: el seed
   * preserva los agregados históricos completos.
   */
  private async pickSnapshot(
    rangeFrom?: Date,
  ): Promise<{ cutoffAt: Date; seed: LedgerSeed } | null> {
    const row = await this.prisma.ledgerSnapshot.findFirst({
      // El corte debe ser <= rangeFrom: si fuera posterior, las ventas del
      // arranque del rango quedarían DENTRO del snapshot y sus costos por venta
      // no están en el seed (a propósito) → COGS en $0.
      where: rangeFrom ? { cutoffAt: { lte: rangeFrom } } : undefined,
      orderBy: { cutoffAt: 'desc' },
      select: { cutoffAt: true, payload: true },
    });
    if (!row) return null;
    return { cutoffAt: row.cutoffAt, seed: row.payload as unknown as LedgerSeed };
  }

  private async loadMovements(where: Prisma.InventoryMovementWhereInput): Promise<LedgerMovement[]> {
    const movements = await this.prisma.inventoryMovement.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        delta: true,
        type: true,
        unitCost: true,
        sourceType: true,
        sourceId: true,
        entityType: true,
        ingredientId: true,
        productId: true,
        subproductId: true,
      },
      // `id` como desempate secundario: con createdAt idéntico (mismo ms),
      // Postgres no garantiza orden → el FIFO sería no-determinista entre
      // corridas. Con el id el replay es 100% reproducible.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return movements.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      delta: Number(m.delta),
      type: m.type,
      unitCost: m.unitCost !== null ? Number(m.unitCost) : null,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      entityType: m.entityType,
      ingredientId: m.ingredientId,
      productId: m.productId,
      subproductId: m.subproductId,
    }));
  }

  private async computeLedger(snapshot: { cutoffAt: Date; seed: LedgerSeed } | null): Promise<LedgerFifo> {
    const opts = { fallbackUnitCost: await this.loadFallbackUnitCost() };
    if (!snapshot) {
      return runLedgerFifo(await this.loadMovements({}), undefined, opts);
    }
    const plain = await this.loadMovements({ createdAt: { gte: snapshot.cutoffAt } });
    return runLedgerFifo(plain, snapshot.seed, opts);
  }

  /**
   * Respaldo para ESTIMAR el faltante de una venta sin stock cuando el replay
   * todavía no vio ninguna entrada de ese stockable (primera venta, sin compras
   * previas). Solo insumos y productos de reventa: los subproductos no tienen
   * precio histórico (su costo se deriva de la producción, y el replay ya lo
   * recuerda solo).
   *
   * ⚠️ `lastUnitCost` está en unit_PURCHASE ($/bulto) y el ledger trabaja en
   * unit_STOCK ($/gramo) → se divide por `conversionFactor` (mismo criterio que
   * el reporte de uso y mermas).
   */
  private async loadFallbackUnitCost(): Promise<Record<string, number>> {
    const [ingredients, products] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: { lastUnitCost: { not: null } },
        select: { id: true, lastUnitCost: true, conversionFactor: true },
      }),
      this.prisma.product.findMany({
        where: { directResale: true, lastUnitCost: { not: null } },
        select: { id: true, lastUnitCost: true, conversionFactor: true },
      }),
    ]);
    const out: Record<string, number> = {};
    for (const i of ingredients) {
      const factor = Number(i.conversionFactor);
      if (!(factor > 0)) continue;
      out[`INGREDIENT:${i.id}`] = Number(i.lastUnitCost) / factor;
    }
    for (const p of products) {
      // conversionFactor null en reventa = 1 (se compra y vende por unidad).
      const factor = p.conversionFactor !== null ? Number(p.conversionFactor) : 1;
      if (!(factor > 0)) continue;
      out[`PRODUCT:${p.id}`] = Number(p.lastUnitCost) / factor;
    }
    return out;
  }

  // ==================================================================
  // Creación de snapshots
  // ==================================================================

  /**
   * Crea (o reemplaza) el snapshot con corte al primer día del mes ACTUAL
   * 00:00 local. Replay completo hasta el corte → semilla persistida. Corre
   * el día 2 a las 4:30 AM: el corte ya tiene >24h — ninguna transacción en
   * vuelo puede insertar movimientos con created_at anterior al corte.
   */
  @Cron('30 4 2 * *')
  async monthlySnapshotCron(): Promise<void> {
    try {
      const result = await this.createLedgerSnapshot();
      this.logger.log(
        `Snapshot del ledger creado: corte ${result.cutoffAt}, ${result.movementsCount} movimientos resumidos`,
      );
    } catch (err) {
      // Sin snapshot el sistema sigue correcto (replay completo) — no re-throw.
      this.logger.error('Fallo el snapshot mensual del ledger', err instanceof Error ? err.stack : err);
    }
  }

  async createLedgerSnapshot(
    cutoff?: Date,
  ): Promise<{ cutoffAt: string; movementsCount: number; lotsCount: number }> {
    const now = new Date();
    const cutoffAt = cutoff ?? new Date(now.getFullYear(), now.getMonth(), 1);
    // El corte debe estar CERRADO: movimientos nuevos siempre llevan
    // created_at ≈ now(), así que un corte con >1h de margen no puede recibir
    // inserciones tardías que lo invaliden silenciosamente.
    if (now.getTime() - cutoffAt.getTime() < 60 * 60 * 1000) {
      throw new Error('El corte del snapshot debe ser al menos 1 hora en el pasado');
    }
    const movements = await this.loadMovements({ createdAt: { lt: cutoffAt } });
    // Mismo fallback que el replay normal: si no, una deuda sembrada guardaría
    // un estimado distinto al que calcula `runLedger` y el corte movería costos.
    const full = runLedgerFifo(movements, undefined, {
      fallbackUnitCost: await this.loadFallbackUnitCost(),
    });
    const seed = buildLedgerSeed(full, cutoffAt.toISOString());
    await this.prisma.ledgerSnapshot.upsert({
      where: { cutoffAt },
      create: {
        cutoffAt,
        payload: seed as unknown as Prisma.InputJsonValue,
        movementsCount: movements.length,
      },
      update: {
        payload: seed as unknown as Prisma.InputJsonValue,
        movementsCount: movements.length,
      },
    });
    this.invalidateLedgerCache();
    return {
      cutoffAt: cutoffAt.toISOString(),
      movementsCount: movements.length,
      lotsCount: Object.keys(seed.lots).length,
    };
  }

  /** Costo FIFO real por solicitud de cortesía (sourceId → costo). Cacheado. */
  async getCortesiaCostBySource(): Promise<
    Map<string, { cost: number; unknownQty: number; estimatedCost: number }>
  > {
    const ledger = await this.runLedger();
    return ledger.cortesiaCostBySource;
  }

  /**
   * Costo FIFO de las cortesías AUTORIZADAS resueltas en [from, to]. Atado a las
   * solicitudes reales (no a movimientos sueltos del ledger): inmune a datos
   * huérfanos de modelos previos. Es la fuente ÚNICA del costo de cortesías para
   * el estado financiero y el KPI de Solicitudes → siempre coinciden.
   */
  async getApprovedCortesiaCost(
    from: Date,
    to: Date,
  ): Promise<{ total: number; count: number; unknownQty: number; estimatedCost: number }> {
    const [ledger, approved] = await Promise.all([
      this.runLedger(),
      this.prisma.cortesiaRequest.findMany({
        where: { status: 'APPROVED', resolvedAt: { gte: from, lte: to } },
        select: { id: true },
      }),
    ]);
    let total = 0;
    let unknownQty = 0;
    let estimatedCost = 0;
    for (const r of approved) {
      const entry = ledger.cortesiaCostBySource.get(r.id);
      total += entry?.cost ?? 0;
      // FIFO sin lote disponible al aprobar → costo desconocido. Lo arrastramos
      // para avisar que la pérdida real puede estar subestimada.
      unknownQty += entry?.unknownQty ?? 0;
      // Parte valuada al último precio conocido: es un número honesto pero
      // provisional, y la UI tiene que decirlo (se corrige con la factura).
      estimatedCost += entry?.estimatedCost ?? 0;
    }
    return {
      total: round(total),
      count: approved.length,
      unknownQty: round(unknownQty),
      estimatedCost: round(estimatedCost),
    };
  }

  // ==================================================================
  // P&L del período
  // ==================================================================

  /** Suma el costo FIFO atribuido a una venta (insumos + reventa + subproductos).
   *  `estimatedQty` = unidades costeadas con un ESTIMADO (venta forzada sin stock,
   *  aún sin factura que confirme el precio real) → el COGS de esa venta no es
   *  exacto todavía; se corrige al subir la factura. */
  private saleCost(
    ledger: LedgerFifo,
    saleId: string,
  ): { cost: number; unknownQty: number; estimatedQty: number } {
    let cost = 0;
    let unknownQty = 0;
    let estimatedQty = 0;
    for (const m of [ledger.saleIngredientCost, ledger.saleProductCost, ledger.saleSubproductCost]) {
      for (const e of m.get(saleId)?.values() ?? []) {
        cost += e.cost;
        unknownQty += e.unknownQty;
        estimatedQty += e.estimatedQty;
      }
    }
    return { cost, unknownQty, estimatedQty };
  }

  async getPnl(from: Date, to: Date): Promise<PnlReport> {
    const [ledger, sales, refunded] = await Promise.all([
      // Costos por venta del rango: si arranca antes del corte del snapshot,
      // runLedger cae a replay completo (regla 2).
      this.runLedger(from),
      this.prisma.sale.findMany({
        where: { paidAt: { gte: from, lte: to }, status: { notIn: [...EXCLUDED_STATUSES] } },
        select: { id: true, total: true, discountTotal: true, deliveryFee: true },
      }),
      // Reembolsos del período: VOID con stock NO revertido (la comida ya se
      // preparó). Su costo FIFO quedó en el ledger pero la venta está excluida
      // de ingresos → si no se suma aparte, el costo del plato regalado se
      // evapora del P&G. Atribuido por paidAt (cuando se consumió el stock).
      this.prisma.sale.findMany({
        where: {
          paidAt: { gte: from, lte: to },
          status: 'VOID',
          voidReason: { startsWith: REFUND_VOID_REASON_PREFIX },
        },
        select: { id: true },
      }),
    ]);

    let revenue = 0;
    // Descuentos ya restados de `revenue`. Se acumulan aparte porque el P&G
    // mostraba el neto sin decir en ningún lado cuánto se regaló.
    let discountTotal = 0;
    let cogs = 0;
    let unknownQty = 0;
    let estimatedQty = 0;
    // El envío NO es ingreso del negocio (decisión del dueño 2026-07-27): esa
    // plata es del domiciliario y solo pasa por la caja. Se descuenta de
    // `revenue` y se reporta aparte — si se sumara, además de inflar las
    // ventas subiría el margen bruto (no consume inventario) y ensuciaría el
    // punto de equilibrio.
    let deliveryCollected = 0;
    let deliveryOrderCount = 0;
    for (const s of sales) {
      const fee = Number(s.deliveryFee ?? 0);
      revenue += Number(s.total) - fee;
      discountTotal += Number(s.discountTotal ?? 0);
      if (fee > 0) {
        deliveryCollected += fee;
        deliveryOrderCount += 1;
      }
      const c = this.saleCost(ledger, s.id);
      cogs += c.cost;
      unknownQty += c.unknownQty;
      estimatedQty += c.estimatedQty;
    }

    let refundCost = 0;
    let refundUnknownQty = 0;
    for (const s of refunded) {
      const c = this.saleCost(ledger, s.id);
      refundCost += c.cost;
      refundUnknownQty += c.unknownQty;
    }

    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const wasteInRange = ledger.waste.filter(
      (w) => w.createdAt >= fromIso && w.createdAt <= toIso,
    );
    const cortesiaInRange = ledger.cortesia.filter(
      (c) => c.createdAt >= fromIso && c.createdAt <= toIso,
    );
    const wasteCost = wasteInRange.reduce((s, w) => s + w.cost, 0);
    const cortesiaCost = cortesiaInRange.reduce((s, c) => s + c.cost, 0);
    const wasteEstimatedCost = wasteInRange.reduce((s, w) => s + w.estimatedCost, 0);
    const cortesiaEstimatedCost = cortesiaInRange.reduce((s, c) => s + c.estimatedCost, 0);

    const grossMargin = revenue - cogs;
    return {
      // Día calendario LOCAL: `to` llega a las 23:59:59.999 locales, que en
      // Bogotá ya es el día siguiente en UTC → `toISOString().slice(0,10)`
      // mostraba "01 jul – 01 ago" para el rango de julio (ver local-dates.ts).
      periodFrom: ymdLocal(from),
      periodTo: ymdLocal(to),
      revenue: round(revenue),
      discountTotal: round(discountTotal),
      grossRevenue: round(revenue + discountTotal),
      cogs: round(cogs),
      grossMargin: round(grossMargin),
      grossMarginPct: revenue > 0 ? Math.round((grossMargin / revenue) * 10000) / 10000 : null,
      wasteCost: round(wasteCost),
      cortesiaCost: round(cortesiaCost),
      refundCost: round(refundCost),
      deliveryCollected: round(deliveryCollected),
      deliveryOrderCount,
      salesCount: sales.length,
      cogsUnknownQty: Math.round((unknownQty + refundUnknownQty) * 10000) / 10000,
      // §1.12: unidades costeadas con ESTIMADO (venta forzada sin stock). El COGS
      // aún NO es exacto para esas unidades — se corrige al subir la factura. Un
      // COGS 100% estimado se veía como exacto (cogsPartial=false).
      cogsEstimatedQty: Math.round(estimatedQty * 10000) / 10000,
      wasteEstimatedCost: round(wasteEstimatedCost),
      cortesiaEstimatedCost: round(cortesiaEstimatedCost),
    };
  }

  // ==================================================================
  // Inventario valorizado (lotes FIFO restantes)
  // ==================================================================

  async getInventoryValuation(): Promise<InventoryValuationReport> {
    const ledger = await this.runLedger();
    const [ingredients, products, subproducts] = await Promise.all([
      this.prisma.ingredient.findMany({ select: { id: true, name: true } }),
      this.prisma.product.findMany({ where: { directResale: true }, select: { id: true, name: true } }),
      this.prisma.subproduct.findMany({ select: { id: true, name: true } }),
    ]);
    const nameByKey = new Map<string, string>();
    for (const i of ingredients) nameByKey.set(`INGREDIENT:${i.id}`, i.name);
    for (const p of products) nameByKey.set(`PRODUCT:${p.id}`, p.name);
    for (const s of subproducts) nameByKey.set(`SUBPRODUCT:${s.id}`, s.name);

    const items: InventoryValuationReport['items'] = [];
    let totalValue = 0;
    let totalUnknownQty = 0;
    for (const [key, r] of ledger.remaining) {
      if (r.qty <= 0 && r.unknownQty <= 0) continue;
      const sep = key.indexOf(':');
      const entityType = key.slice(0, sep) as 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';
      const id = key.slice(sep + 1);
      const name = nameByKey.get(key);
      if (!name) continue; // stockable inactivo/eliminado
      totalValue += r.value;
      totalUnknownQty += r.unknownQty;
      items.push({
        entityType,
        id,
        name,
        qty: Math.round(r.qty * 10000) / 10000,
        value: round(r.value),
        unknownQty: Math.round(r.unknownQty * 10000) / 10000,
      });
    }
    items.sort((a, b) => b.value - a.value);
    return {
      asOf: new Date().toISOString(),
      items,
      totalValue: round(totalValue),
      totalUnknownQty: Math.round(totalUnknownQty * 10000) / 10000,
    };
  }

  /** Lotes FIFO restantes por stockable (orden de consumo). Solo lectura: para
   *  mostrar "tu inventario rinde N porciones a $X, M a $Y" en el editor de
   *  receta, sin tocar el costeo. */
  async getFifoLots(): Promise<FifoLotsResponse> {
    const ledger = await this.runLedger();
    const entities: FifoLotsResponse['entities'] = [];
    for (const [key, lots] of ledger.remainingLots) {
      const sep = key.indexOf(':');
      const entityType = key.slice(0, sep) as 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';
      const entityId = key.slice(sep + 1);
      entities.push({
        entityType,
        entityId,
        lots: lots.map((l) => ({ qty: Math.round(l.qty * 10000) / 10000, unitCost: l.unitCost })),
      });
    }
    return { entities };
  }

  // ==================================================================
  // Margen real por producto (split proporcional exacto por venta)
  // ==================================================================

  async getProductMargins(from: Date, to: Date): Promise<ProductMarginReport> {
    const [ledger, sales] = await Promise.all([
      this.runLedger(from),
      this.prisma.sale.findMany({
        where: { paidAt: { gte: from, lte: to }, status: { notIn: [...EXCLUDED_STATUSES] } },
        select: {
          id: true,
          orderDiscountAmount: true,
          items: { select: { productId: true, quantity: true, sizeId: true, lineTotal: true } },
        },
      }),
    ]);

    const products = await this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        directResale: true,
        isCombo: true,
        comboComponents: { select: { productId: true, quantity: true } },
      },
    });
    const meta = new Map(products.map((p) => [p.id, p]));

    // Cache de grafos por (producto, variante) para incluir la receta de la
    // variante (proteína), igual que en confirmPayment.
    const graphCache = new Map<string, { graph: RecipeGraph; root: ParentRef }>();
    const graphFor = async (productId: string, sizeId: string | null) => {
      const key = `${productId}:${sizeId ?? ''}`;
      const cached = graphCache.get(key);
      if (cached) return cached;
      const g = await this.recipes.loadGraphForProduct(productId, sizeId ?? undefined);
      graphCache.set(key, g);
      return g;
    };

    interface Acc {
      name: string;
      units: number;
      revenue: number;
      cogs: number;
      partial: boolean;
    }
    const acc = new Map<string, Acc>();
    const bump = (productId: string): Acc => {
      const existing = acc.get(productId);
      if (existing) return existing;
      const fresh: Acc = {
        name: meta.get(productId)?.name ?? '(eliminado)',
        units: 0,
        revenue: 0,
        cogs: 0,
        partial: false,
      };
      acc.set(productId, fresh);
      return fresh;
    };

    for (const sale of sales) {
      const ingCost = ledger.saleIngredientCost.get(sale.id);
      const prodCost = ledger.saleProductCost.get(sale.id);
      const subCost = ledger.saleSubproductCost.get(sale.id);
      const unitOf = (m: Map<string, CostQty> | undefined, id: string): number => {
        const e = m?.get(id);
        if (!e) return 0;
        // Costo por unidad CONOCIDA: `cost` es solo la porción con costo, así que
        // se divide por las unidades conocidas (qty − unknownQty), NO por el total
        // (eso diluía el costo conocido sobre unidades sin costo y subestimaba el
        // COGS de las filas parciales). La fila se marca `partial` aparte.
        const knownQty = e.qty - e.unknownQty;
        return knownQty > 0 ? e.cost / knownQty : 0;
      };
      const partialOf = (m: Map<string, CostQty> | undefined, id: string): boolean =>
        (m?.get(id)?.unknownQty ?? 0) > 0;

      // Descuento manual SOBRE EL TOTAL (#5b): no vive en las líneas — se
      // prorratea por el peso de cada línea para que Σ revenue por producto
      // concilie con sale.total (y con getPnl). Sin esto, una venta con
      // descuento al total inflaba el revenue/margen de sus productos.
      const orderDiscount = Number(sale.orderDiscountAmount ?? 0);
      const saleLineSum = sale.items.reduce((s, it) => s + Number(it.lineTotal), 0);
      const orderDiscountFactor =
        orderDiscount > 0 && saleLineSum > 0 ? orderDiscount / saleLineSum : 0;

      for (const item of sale.items) {
        const p = meta.get(item.productId);
        const a = bump(item.productId);
        a.units += item.quantity;
        a.revenue += Number(item.lineTotal) * (1 - orderDiscountFactor);
        if (!p) {
          a.partial = true;
          continue;
        }

        const draws = await this.expandLineToConsumption(p, item.quantity, item.sizeId, meta, graphFor);
        for (const d of draws) {
          if (d.kind === 'ingredient') {
            a.cogs += d.qty * unitOf(ingCost, d.id);
            if (partialOf(ingCost, d.id)) a.partial = true;
          } else if (d.kind === 'subproduct') {
            a.cogs += d.qty * unitOf(subCost, d.id);
            if (partialOf(subCost, d.id)) a.partial = true;
          } else {
            a.cogs += d.qty * unitOf(prodCost, d.id);
            if (partialOf(prodCost, d.id)) a.partial = true;
          }
        }
      }
    }

    const list: ProductMargin[] = [...acc.entries()].map(([productId, a]) => {
      const margin = a.revenue - a.cogs;
      return {
        productId,
        productName: a.name,
        unitsSold: a.units,
        revenue: round(a.revenue),
        cogs: round(a.cogs),
        margin: round(margin),
        marginPct: a.revenue > 0 ? Math.round((margin / a.revenue) * 10000) / 10000 : null,
        cogsPartial: a.partial,
      };
    });
    list.sort((x, y) => y.margin - x.margin);

    const tRevenue = list.reduce((s, p) => s + p.revenue, 0);
    const tCogs = list.reduce((s, p) => s + p.cogs, 0);
    const tMargin = tRevenue - tCogs;
    return {
      // Día calendario LOCAL — mismo motivo que en `getPnl`.
      periodFrom: ymdLocal(from),
      periodTo: ymdLocal(to),
      products: list,
      totals: {
        revenue: round(tRevenue),
        cogs: round(tCogs),
        margin: round(tMargin),
        marginPct: tRevenue > 0 ? Math.round((tMargin / tRevenue) * 10000) / 10000 : null,
      },
    };
  }

  /**
   * Expande una línea de venta a sus consumos (insumos DIRECTOS + subproductos
   * DIRECTOS + productos de reventa), espejando exactamente la lógica de
   * `SalesService.confirmPayment.consume` (one-level) para que las cantidades
   * coincidan con los movimientos FIFO → atribución de costo exacta.
   *
   * NO desciende por las recetas de los subproductos (el costo de ellos viene
   * del lot FIFO de su producción, no de expandir su receta).
   *
   * LIMITACIÓN conocida (auditoría 2026-07-05): expande la receta VIGENTE, no
   * la del momento de la venta. Si la receta cambió después, las cantidades
   * difieren del consumo real del ledger → el margen POR PRODUCTO es una
   * aproximación en ese caso (el P&G global no sufre esto: suma el ledger
   * directo). Arreglarlo exigiría snapshot de receta por venta.
   */
  private async expandLineToConsumption(
    product: { id: string; directResale: boolean; isCombo: boolean; comboComponents: { productId: string; quantity: number }[] },
    quantity: number,
    sizeId: string | null,
    meta: Map<string, { id: string; directResale: boolean; isCombo: boolean; comboComponents: { productId: string; quantity: number }[] }>,
    graphFor: (productId: string, sizeId: string | null) => Promise<{ graph: RecipeGraph; root: ParentRef }>,
  ): Promise<{ kind: 'ingredient' | 'subproduct' | 'product'; id: string; qty: number }[]> {
    const draws: { kind: 'ingredient' | 'subproduct' | 'product'; id: string; qty: number }[] = [];

    const consume = async (p: { id: string; directResale: boolean }, qty: number, size: string | null): Promise<void> => {
      if (p.directResale) {
        draws.push({ kind: 'product', id: p.id, qty });
        return;
      }
      const { graph, root } = await graphFor(p.id, size);
      const expanded = expandRecipeOneLevel(graph, root, qty);
      for (const ing of expanded.ingredients.values()) {
        draws.push({ kind: 'ingredient', id: ing.ingredientId, qty: ing.totalQuantity });
      }
      for (const sub of expanded.subproducts.values()) {
        draws.push({ kind: 'subproduct', id: sub.subproductId, qty: sub.totalQuantity });
      }
    };

    if (product.isCombo) {
      for (const comp of product.comboComponents) {
        const cp = meta.get(comp.productId);
        if (!cp) continue;
        await consume(cp, quantity * comp.quantity, null);
      }
    } else {
      await consume(product, quantity, sizeId);
    }
    return draws;
  }
}
