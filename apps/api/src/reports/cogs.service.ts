import { Injectable } from '@nestjs/common';
import {
  expandRecipeOneLevel,
  type ParentRef,
  type RecipeGraph,
} from '@pos-tercos/domain';
import type {
  InventoryValuationReport,
  PnlReport,
  ProductMargin,
  ProductMarginReport,
} from '@pos-tercos/types';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';

const EXCLUDED_STATUSES = ['PENDIENTE_PAGO', 'CANCELADO_NO_PAGO', 'VOID'] as const;

interface CostQty {
  cost: number;
  qty: number;
  unknownQty: number;
}

/** Resultado del replay FIFO de TODO el ledger, indexado para los reportes. */
interface LedgerFifo {
  /** saleId → ingredientId → costo/cantidad consumida (insumos directos). */
  saleIngredientCost: Map<string, Map<string, CostQty>>;
  /** saleId → productId → costo/cantidad (productos de reventa directa). */
  saleProductCost: Map<string, Map<string, CostQty>>;
  /** saleId → subproductId → costo/cantidad (subproductos consumidos por
   *  productos preparados). El costo viene del lot FIFO del subproducto que
   *  se creó al producirlo (suma de insumos consumidos / cantidad producida). */
  saleSubproductCost: Map<string, Map<string, CostQty>>;
  /** Mermas valorizadas, con timestamp para filtrar por período. NO incluye
   *  consumos de tipo PRODUCTION (esos se cuentan dentro del lot cost del
   *  subproducto producido). */
  waste: { createdAt: string; cost: number; unknownQty: number }[];
  /** Lotes restantes por stockable: `${entityType}:${id}` → valor/cantidad. */
  remaining: Map<string, { qty: number; value: number; unknownQty: number }>;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function toIso(d: string | Date): string {
  return typeof d === 'string' ? d : d.toISOString();
}

@Injectable()
export class CogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipesService,
  ) {}

  // ==================================================================
  // Replay FIFO de todo el ledger (núcleo de todos los reportes).
  //
  // Orquestador cronológico que procesa TODOS los stockables en una sola
  // pasada por tiempo, manteniendo una cola FIFO por entidad. Esto es
  // necesario porque las tandas de PRODUCCIÓN cruzan stockables:
  //   - consume insumos (FIFO de su lote)
  //   - emite +N de un subproducto con lot cost = suma de insumos / qty
  //
  // El siguiente evento (otra venta o producción) puede consumir esos lotes
  // recién creados. Por eso necesitamos interleaving en el tiempo.
  //
  // Para sub-subproductos (subproducto A consume subproducto B en su
  // producción): el orquestador propaga el costo automáticamente porque B
  // ya tiene su lot al momento que A se produce (si B se produjo antes).
  // Si B no tiene stock al momento, el costo de A queda parcialmente
  // desconocido (unknownQty).
  // ==================================================================

  private async runLedger(): Promise<LedgerFifo> {
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
      orderBy: { createdAt: 'asc' },
    });

    type Mov = typeof movements[number];
    const keyOf = (m: Mov): string | null => {
      const id =
        m.entityType === 'INGREDIENT' ? m.ingredientId
        : m.entityType === 'PRODUCT' ? m.productId
        : m.subproductId;
      return id ? `${m.entityType}:${id}` : null;
    };

    // Eventos: cada producción es UN evento atómico (todos sus movements
    // se procesan juntos para poder computar lot cost del +N). El resto
    // son eventos individuales.
    type Event =
      | { kind: 'single'; ts: Date; m: Mov }
      | { kind: 'production'; ts: Date; consumes: Mov[]; produces: Mov };

    const productionSeen = new Set<string>();
    const events: Event[] = [];
    for (const m of movements) {
      if (m.sourceType === 'production' && m.sourceId) {
        if (productionSeen.has(m.sourceId)) continue;
        productionSeen.add(m.sourceId);
        const batch = movements.filter(
          (x) => x.sourceType === 'production' && x.sourceId === m.sourceId,
        );
        const produces = batch.find((x) => Number(x.delta) > 0);
        const consumes = batch.filter((x) => Number(x.delta) < 0);
        if (!produces) continue; // batch malformado, ignorar
        events.push({ kind: 'production', ts: m.createdAt, consumes, produces });
      } else {
        events.push({ kind: 'single', ts: m.createdAt, m });
      }
    }
    // Estable por createdAt. Las producciones ya están atómicas.
    events.sort((a, b) => a.ts.getTime() - b.ts.getTime());

    // Estado FIFO por stockable.
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
    const queues = new Map<string, Lot[]>();
    // Para revertir consumo de venta cuando se anula: key = `${saleId}:${stockableKey}`.
    const drawsBySource = new Map<string, Draw[]>();

    const out: LedgerFifo = {
      saleIngredientCost: new Map(),
      saleProductCost: new Map(),
      saleSubproductCost: new Map(),
      waste: [],
      remaining: new Map(),
    };

    const targetMap = (et: string): Map<string, Map<string, CostQty>> | null => {
      if (et === 'INGREDIENT') return out.saleIngredientCost;
      if (et === 'PRODUCT') return out.saleProductCost;
      if (et === 'SUBPRODUCT') return out.saleSubproductCost;
      return null;
    };
    const attributeToSale = (
      et: string,
      stockableId: string,
      saleId: string,
      cost: number,
      qty: number,
      unknownQty: number,
    ): void => {
      const t = targetMap(et);
      if (!t) return;
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
      return { cost: round4(cost), unknownQty: round4(unknownQty), draws };
    };

    const addLot = (
      key: string,
      lot: Lot,
    ): void => {
      const q = queues.get(key) ?? [];
      q.push(lot);
      queues.set(key, q);
    };

    for (const e of events) {
      if (e.kind === 'production') {
        // 1. Consumir insumos / sub-subproductos.
        let totalCost = 0;
        let totalUnknownQty = 0;
        for (const c of e.consumes) {
          const cKey = keyOf(c);
          if (!cKey) continue;
          const { cost, unknownQty } = consumeFifo(cKey, Math.abs(Number(c.delta)));
          totalCost += cost;
          totalUnknownQty += unknownQty;
        }
        // 2. Crear lote del +N con costo unitario derivado.
        const posKey = keyOf(e.produces);
        const posQty = Number(e.produces.delta);
        if (posKey && posQty > 0) {
          // Si hubo unknownQty en consumos, el costo del lote queda null
          // (no asumimos $0). Igual entra al stock como reserva sin costo.
          const lotUnitCost =
            totalUnknownQty > 0 ? null : round4(totalCost / posQty);
          addLot(posKey, {
            movementId: e.produces.id,
            qty: posQty,
            unitCost: lotUnitCost,
            createdAt: toIso(e.produces.createdAt),
          });
        }
        continue;
      }

      // === SINGLE ===
      const m = e.m;
      const key = keyOf(m);
      if (!key) continue;
      const delta = Number(m.delta);
      const iso = toIso(m.createdAt);

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
            -round4(returnedCost),
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
          unitCost: m.unitCost !== null ? Number(m.unitCost) : null,
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

    // Construir remaining a partir del estado final de cada cola.
    for (const [key, q] of queues) {
      let value = 0;
      let unknownQty = 0;
      let qty = 0;
      for (const l of q) {
        qty += l.qty;
        if (l.unitCost === null) unknownQty += l.qty;
        else value += l.qty * l.unitCost;
      }
      out.remaining.set(key, {
        qty: round4(qty),
        value: round4(value),
        unknownQty: round4(unknownQty),
      });
    }
    return out;
  }

  // ==================================================================
  // P&L del período
  // ==================================================================

  async getPnl(from: Date, to: Date): Promise<PnlReport> {
    const [ledger, sales] = await Promise.all([
      this.runLedger(),
      this.prisma.sale.findMany({
        where: { paidAt: { gte: from, lte: to }, status: { notIn: [...EXCLUDED_STATUSES] } },
        select: { id: true, total: true },
      }),
    ]);

    let revenue = 0;
    let cogs = 0;
    let unknownQty = 0;
    for (const s of sales) {
      revenue += Number(s.total);
      for (const e of ledger.saleIngredientCost.get(s.id)?.values() ?? []) {
        cogs += e.cost;
        unknownQty += e.unknownQty;
      }
      for (const e of ledger.saleProductCost.get(s.id)?.values() ?? []) {
        cogs += e.cost;
        unknownQty += e.unknownQty;
      }
      for (const e of ledger.saleSubproductCost.get(s.id)?.values() ?? []) {
        cogs += e.cost;
        unknownQty += e.unknownQty;
      }
    }

    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const wasteCost = ledger.waste
      .filter((w) => w.createdAt >= fromIso && w.createdAt <= toIso)
      .reduce((s, w) => s + w.cost, 0);

    const grossMargin = revenue - cogs;
    return {
      periodFrom: fromIso.slice(0, 10),
      periodTo: toIso.slice(0, 10),
      revenue: round(revenue),
      cogs: round(cogs),
      grossMargin: round(grossMargin),
      grossMarginPct: revenue > 0 ? Math.round((grossMargin / revenue) * 10000) / 10000 : null,
      wasteCost: round(wasteCost),
      salesCount: sales.length,
      cogsUnknownQty: Math.round(unknownQty * 10000) / 10000,
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
        return e && e.qty > 0 ? e.cost / e.qty : 0;
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
