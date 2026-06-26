import { Injectable } from '@nestjs/common';
import {
  expandRecipeOneLevel,
  runLedgerFifo,
  type CostQty,
  type LedgerFifo,
  type LedgerMovement,
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

  // ==================================================================
  // Replay FIFO del ledger — la lógica vive en @pos-tercos/domain
  // (runLedgerFifo, pura y testeada). Acá solo cargamos los movimientos
  // ordenados y los mapeamos a datos planos.
  // ==================================================================

  /**
   * Caché del ledger con TTL corto. `runLedger` se llamaba varias veces por
   * request (y se recomputaba entero en cada request): cargar TODOS los
   * movimientos + replay FIFO es caro. Memoizar la PROMESA además deduplica
   * llamados concurrentes. Sin invalidación por escritura a propósito: un
   * reporte de COGS tolera ≤ TTL de staleness (no es dato transaccional vivo).
   */
  // 60s: el replay (O(n) tras quitar el O(n²) de tandas) sigue siendo caro a
  // escala; un reporte financiero tolera 1 min de staleness sin problema. El KPI
  // de cortesías y el estado mensual leen la MISMA caché → siguen coincidiendo.
  private static readonly LEDGER_TTL_MS = 60_000;
  private ledgerCache: { promise: Promise<LedgerFifo>; at: number } | null = null;

  private runLedger(): Promise<LedgerFifo> {
    const now = Date.now();
    if (this.ledgerCache && now - this.ledgerCache.at < CogsService.LEDGER_TTL_MS) {
      return this.ledgerCache.promise;
    }
    const promise = this.computeLedger();
    this.ledgerCache = { promise, at: now };
    // No cachear un error: si falla, limpiar para reintentar en el próximo call.
    void promise.catch(() => {
      if (this.ledgerCache?.promise === promise) this.ledgerCache = null;
    });
    return promise;
  }

  private async computeLedger(): Promise<LedgerFifo> {
    const movements = await this.prisma.inventoryMovement.findMany({
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
    const plain: LedgerMovement[] = movements.map((m) => ({
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
    return runLedgerFifo(plain);
  }

  /** Costo FIFO real por solicitud de cortesía (sourceId → costo). Cacheado. */
  async getCortesiaCostBySource(): Promise<Map<string, { cost: number; unknownQty: number }>> {
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
  ): Promise<{ total: number; count: number; unknownQty: number }> {
    const [ledger, approved] = await Promise.all([
      this.runLedger(),
      this.prisma.cortesiaRequest.findMany({
        where: { status: 'APPROVED', resolvedAt: { gte: from, lte: to } },
        select: { id: true },
      }),
    ]);
    let total = 0;
    let unknownQty = 0;
    for (const r of approved) {
      const entry = ledger.cortesiaCostBySource.get(r.id);
      total += entry?.cost ?? 0;
      // FIFO sin lote disponible al aprobar → costo desconocido. Lo arrastramos
      // para avisar que la pérdida real puede estar subestimada.
      unknownQty += entry?.unknownQty ?? 0;
    }
    return { total: round(total), count: approved.length, unknownQty: round(unknownQty) };
  }

  // ==================================================================
  // P&L del período
  // ==================================================================

  /** Suma el costo FIFO atribuido a una venta (insumos + reventa + subproductos). */
  private saleCost(ledger: LedgerFifo, saleId: string): { cost: number; unknownQty: number } {
    let cost = 0;
    let unknownQty = 0;
    for (const m of [ledger.saleIngredientCost, ledger.saleProductCost, ledger.saleSubproductCost]) {
      for (const e of m.get(saleId)?.values() ?? []) {
        cost += e.cost;
        unknownQty += e.unknownQty;
      }
    }
    return { cost, unknownQty };
  }

  async getPnl(from: Date, to: Date): Promise<PnlReport> {
    const [ledger, sales, refunded] = await Promise.all([
      this.runLedger(),
      this.prisma.sale.findMany({
        where: { paidAt: { gte: from, lte: to }, status: { notIn: [...EXCLUDED_STATUSES] } },
        select: { id: true, total: true },
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
    let cogs = 0;
    let unknownQty = 0;
    for (const s of sales) {
      revenue += Number(s.total);
      const c = this.saleCost(ledger, s.id);
      cogs += c.cost;
      unknownQty += c.unknownQty;
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
    const wasteCost = ledger.waste
      .filter((w) => w.createdAt >= fromIso && w.createdAt <= toIso)
      .reduce((s, w) => s + w.cost, 0);
    const cortesiaCost = ledger.cortesia
      .filter((c) => c.createdAt >= fromIso && c.createdAt <= toIso)
      .reduce((s, c) => s + c.cost, 0);

    const grossMargin = revenue - cogs;
    return {
      periodFrom: fromIso.slice(0, 10),
      periodTo: toIso.slice(0, 10),
      revenue: round(revenue),
      cogs: round(cogs),
      grossMargin: round(grossMargin),
      grossMarginPct: revenue > 0 ? Math.round((grossMargin / revenue) * 10000) / 10000 : null,
      wasteCost: round(wasteCost),
      cortesiaCost: round(cortesiaCost),
      refundCost: round(refundCost),
      salesCount: sales.length,
      cogsUnknownQty: Math.round((unknownQty + refundUnknownQty) * 10000) / 10000,
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
      this.runLedger(),
      this.prisma.sale.findMany({
        where: { paidAt: { gte: from, lte: to }, status: { notIn: [...EXCLUDED_STATUSES] } },
        select: {
          id: true,
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

      for (const item of sale.items) {
        const p = meta.get(item.productId);
        const a = bump(item.productId);
        a.units += item.quantity;
        a.revenue += Number(item.lineTotal);
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
      periodFrom: from.toISOString().slice(0, 10),
      periodTo: to.toISOString().slice(0, 10),
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
