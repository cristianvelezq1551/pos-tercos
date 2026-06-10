import { Injectable, Logger } from '@nestjs/common';
import {
  DAILY_SUMMARY_SYSTEM,
  buildDailySummaryUserPrompt,
  type DailySummaryInput,
} from '@pos-tercos/domain';
import type {
  AiSummary,
  DashboardSummary,
  HourHeatmapReport,
  SalesGranularity,
  SalesSummary,
  SuggestionsMetrics,
  TopProductsReport,
  WhatsAppMetrics,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { LLMService } from '../adapters/llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';

/**
 * Reportes operativos / de negocio (FASE 13.A).
 *
 * Diseño:
 * - Cada método arma su propia query SQL focalizada (groupBy + aggregate).
 *   No reusamos un mega-pipeline porque las dimensiones varían.
 * - Período se interpreta como "fecha local Bogotá" (timezone-naive ok
 *   para v1 — el backend corre en TZ Colombia).
 * - "Sales pagadas" = status NOT IN (PENDIENTE_PAGO, CANCELADO_NO_PAGO,
 *   VOID). Esto incluye PAGADO, EN_PREPARACION, LISTO_DESPACHO, ENTREGADO,
 *   CANCELADO_SIN_REEMBOLSO.
 *   Idea: una vez que el cliente pagó, eso ya es revenue del día.
 */
@Injectable()
export class SalesReportsService {
  private readonly logger = new Logger(SalesReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipesService,
    private readonly llm: LLMService,
  ) {}

  // ==================================================================
  // RESUMEN DIARIO CON IA (lenguaje natural para el dueño)
  // ==================================================================

  async getDailyAiSummary(date: Date): Promise<AiSummary> {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const [summary, top, shift, delayed, lowStock] = await Promise.all([
      this.getSalesSummary(dayStart, dayEnd, 'daily'),
      this.getTopProducts(dayStart, dayEnd, 3),
      this.prisma.shift.findFirst({
        where: {
          closedAt: { gte: dayStart, lte: dayEnd },
          status: { in: ['CLOSED', 'RECONCILED'] },
        },
        orderBy: { closedAt: 'desc' },
        select: { difference: true },
      }),
      this.prisma.auditLog.count({
        where: { action: 'KDS_ORDER_DELAYED', createdAt: { gte: dayStart, lte: dayEnd } },
      }),
      this.computeLowStockCount(),
    ]);

    const cashRevenue = summary.byMethod.find((m) => m.method === 'CASH')?.revenue ?? 0;
    const metrics: DailySummaryInput = {
      date: toDayBucket(dayStart),
      revenue: summary.totals.revenue,
      orderCount: summary.totals.count,
      avgTicket: summary.totals.avgTicket,
      cashRevenue,
      digitalRevenue: round(summary.totals.revenue - cashRevenue),
      voidCount: summary.totals.voidCount,
      cashDifference: shift?.difference != null ? Number(shift.difference) : null,
      delayedKitchenCount: delayed,
      lowStockCount: lowStock,
      topProducts: top.products.map((p) => ({ name: p.productName, qty: p.quantity })),
    };

    const result = await this.llm.complete({
      systemPrompt: DAILY_SUMMARY_SYSTEM,
      userPrompt: buildDailySummaryUserPrompt(metrics),
      maxTokens: 350,
    });
    return { text: result.text, modelUsed: result.modelUsed, generatedAt: new Date().toISOString() };
  }

  // ==================================================================
  // SALES SUMMARY — series + breakdowns
  // ==================================================================

  async getSalesSummary(
    from: Date,
    to: Date,
    granularity: SalesGranularity,
  ): Promise<SalesSummary> {
    const where = paidSalesWhere(from, to);

    const sales = await this.prisma.sale.findMany({
      where,
      select: {
        type: true,
        paymentMethod: true,
        total: true,
        discountTotal: true,
        paidAt: true,
        status: true,
      },
    });

    // Total / avg / discount / count + voidCount
    const voidCount = await this.prisma.sale.count({
      where: {
        status: 'VOID',
        createdAt: { gte: from, lte: to },
      },
    });

    let revenue = 0;
    let discount = 0;
    const buckets = new Map<string, { count: number; revenue: number; discount: number }>();
    const byType = new Map<string, { count: number; revenue: number }>();
    const byMethod = new Map<string, { count: number; revenue: number }>();

    for (const s of sales) {
      const total = Number(s.total);
      const disc = Number(s.discountTotal);
      revenue += total;
      discount += disc;

      const at = s.paidAt ?? new Date();
      const bucketKey =
        granularity === 'hourly'
          ? toHourBucket(at)
          : toDayBucket(at);
      const b = buckets.get(bucketKey) ?? { count: 0, revenue: 0, discount: 0 };
      b.count += 1;
      b.revenue += total;
      b.discount += disc;
      buckets.set(bucketKey, b);

      const t = byType.get(s.type) ?? { count: 0, revenue: 0 };
      t.count += 1;
      t.revenue += total;
      byType.set(s.type, t);

      if (s.paymentMethod) {
        const m = byMethod.get(s.paymentMethod) ?? { count: 0, revenue: 0 };
        m.count += 1;
        m.revenue += total;
        byMethod.set(s.paymentMethod, m);
      }
    }

    const count = sales.length;
    const avgTicket = count > 0 ? revenue / count : 0;

    return {
      periodFrom: toDayBucket(from),
      periodTo: toDayBucket(to),
      granularity,
      totals: {
        count,
        revenue: round(revenue),
        discount: round(discount),
        voidCount,
        avgTicket: round(avgTicket),
      },
      buckets: Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucket, v]) => ({
          bucket,
          count: v.count,
          revenue: round(v.revenue),
          discount: round(v.discount),
        })),
      byType: Array.from(byType.entries()).map(([type, v]) => ({
        type: type as 'COUNTER' | 'WEB_PICKUP',
        count: v.count,
        revenue: round(v.revenue),
      })),
      byMethod: Array.from(byMethod.entries()).map(([method, v]) => ({
        method: method as
          | 'CASH'
          | 'NEQUI'
          | 'DAVIPLATA'
          | 'QR_BANCOLOMBIA'
          | 'TRANSFER',
        count: v.count,
        revenue: round(v.revenue),
      })),
    };
  }

  // ==================================================================
  // TOP PRODUCTS
  // ==================================================================

  async getTopProducts(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<TopProductsReport> {
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: paidSalesWhere(from, to) },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: limit,
    });

    const productIds = grouped.map((g) => g.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Costo unitario via RecipesService.expandedCost — cálculo recursivo
    // real (incluye subproducts, no la aproximación de FASE 13.A).
    // N+1 controlado: limit ≤ 100, endpoint admin-only no en hot path.
    const result = await Promise.all(
      grouped.map(async (g) => {
        const product = productMap.get(g.productId);
        const productName = product?.name ?? '(producto eliminado)';
        const quantity = Number(g._sum.quantity ?? 0);
        const revenue = Number(g._sum.lineTotal ?? 0);

        let estCostPerUnit: number | null = null;
        if (product) {
          try {
            const cost = await this.recipes.expandedCost(g.productId);
            estCostPerUnit = cost.totalCost;
          } catch (e) {
            this.logger.warn(
              `expandedCost failed for ${g.productId}: ${(e as Error).message}`,
            );
          }
        }
        const estCost =
          estCostPerUnit !== null ? estCostPerUnit * quantity : null;
        const estMargin = estCost !== null ? revenue - estCost : null;
        const estMarginPct =
          estMargin !== null && revenue > 0 ? estMargin / revenue : null;
        return {
          productId: g.productId,
          productName,
          quantity,
          revenue: round(revenue),
          estCost: estCost === null ? null : round(estCost),
          estMargin: estMargin === null ? null : round(estMargin),
          estMarginPct: estMarginPct === null ? null : round4(estMarginPct),
        };
      }),
    );

    return {
      periodFrom: toDayBucket(from),
      periodTo: toDayBucket(to),
      products: result,
    };
  }

  // ==================================================================
  // HOUR HEATMAP — día de semana × hora
  // ==================================================================

  async getHourHeatmap(from: Date, to: Date): Promise<HourHeatmapReport> {
    const sales = await this.prisma.sale.findMany({
      where: paidSalesWhere(from, to),
      select: { paidAt: true, total: true },
    });

    const cells = new Map<string, { count: number; revenue: number }>();
    for (const s of sales) {
      const at = s.paidAt ?? new Date();
      const dow = at.getDay();
      const hour = at.getHours();
      const key = `${dow}-${hour}`;
      const cell = cells.get(key) ?? { count: 0, revenue: 0 };
      cell.count += 1;
      cell.revenue += Number(s.total);
      cells.set(key, cell);
    }

    return {
      periodFrom: toDayBucket(from),
      periodTo: toDayBucket(to),
      cells: Array.from(cells.entries()).map(([key, v]) => {
        const [dow, hour] = key.split('-').map(Number);
        return {
          dow: dow!,
          hour: hour!,
          count: v.count,
          revenue: round(v.revenue),
        };
      }),
    };
  }

  // ==================================================================
  // WHATSAPP METRICS — cobertura por stage
  // ==================================================================

  async getWhatsAppMetrics(from: Date, to: Date): Promise<WhatsAppMetrics> {
    // Sales WEB_PICKUP en el período.
    const webSales = await this.prisma.sale.findMany({
      where: {
        type: 'WEB_PICKUP',
        createdAt: { gte: from, lte: to },
      },
      select: { id: true, status: true, paidAt: true },
    });
    const totalWebSales = webSales.length;
    const webSaleIds = new Set(webSales.map((s) => s.id));

    // todo pedido web debería recibir instrucciones de pago al crearse
    const eligiblePaymentInstructions = webSales.length;
    const eligiblePaymentReceived = webSales.filter((s) => s.paidAt !== null).length;
    const eligiblePickupReady = webSales.filter((s) =>
      ['LISTO_DESPACHO', 'ENTREGADO'].includes(s.status),
    ).length;

    // Mensajes OpenWA realmente enviados (status='sent') de estos pedidos web.
    // Filtramos por saleId (no por createdAt del mensaje) para no perder mensajes
    // de etapas tardías — p. ej. "listo" se envía horas después de crear el pedido.
    const messages = webSaleIds.size
      ? await this.prisma.whatsAppMessage.findMany({
          where: { status: 'sent', saleId: { in: [...webSaleIds] } },
          select: { saleId: true, stage: true },
        })
      : [];
    const reachedByStage: Record<string, Set<string>> = {
      payment_instructions: new Set(),
      payment_received: new Set(),
      pickup_ready: new Set(),
    };
    for (const m of messages) {
      if (!m.saleId) continue;
      const bucket = reachedByStage[m.stage];
      if (bucket) bucket.add(m.saleId);
    }

    const buildStage = (
      stage: 'payment_instructions' | 'payment_received' | 'pickup_ready',
      eligible: number,
    ) => {
      const reached = reachedByStage[stage].size;
      return {
        stage,
        eligible,
        reached,
        coveragePct: eligible > 0 ? round4(reached / eligible) : null,
      };
    };

    return {
      periodFrom: toDayBucket(from),
      periodTo: toDayBucket(to),
      totalWebSales,
      stages: [
        buildStage('payment_instructions', eligiblePaymentInstructions),
        buildStage('payment_received', eligiblePaymentReceived),
        buildStage('pickup_ready', eligiblePickupReady),
      ],
    };
  }

  // ==================================================================
  // IA SUGGESTIONS METRICS
  // ==================================================================

  async getSuggestionsMetrics(
    from: Date,
    to: Date,
  ): Promise<SuggestionsMetrics> {
    const grouped = await this.prisma.purchaseSuggestion.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const byStatus = {
      pending: 0,
      evaluated: 0,
      accepted: 0,
      rejected: 0,
      stale: 0,
    };
    for (const g of grouped) {
      const key = g.status.toLowerCase() as keyof typeof byStatus;
      byStatus[key] = g._count._all;
    }

    const evaluatedCount = await this.prisma.purchaseSuggestion.count({
      where: {
        llmEvaluatedAt: { gte: from, lte: to },
      },
    });

    const acceptedSum = await this.prisma.purchaseSuggestion.aggregate({
      where: {
        status: 'ACCEPTED',
        resolvedAt: { gte: from, lte: to },
      },
      _sum: { estTotal: true },
    });

    return {
      periodFrom: toDayBucket(from),
      periodTo: toDayBucket(to),
      byStatus,
      evaluatedCount,
      acceptedEstTotal: round(Number(acceptedSum._sum.estTotal ?? 0)),
    };
  }

  // ==================================================================
  // DASHBOARD SUMMARY
  // ==================================================================

  async getDashboardSummary(): Promise<DashboardSummary> {
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);
    const lastWeekStart = startOfDay(addDays(now, -7));
    // Mismo instante (HH:mm) de hace 7 días, NO el día completo: así el día
    // parcial de hoy se compara contra el mismo tramo parcial de la semana
    // pasada (si no, en la mañana el WoW% siempre se ve fuertemente negativo).
    const lastWeekEnd = addDays(now, -7);

    const [today, lastWeekSameDay, pendingWeb, inKitchen, ready, lowStock, pendingSugg] = await Promise.all([
      this.prisma.sale.aggregate({
        where: paidSalesWhere(dayStart, dayEnd),
        _sum: { total: true, discountTotal: true },
        _count: true,
      }),
      this.prisma.sale.aggregate({
        where: paidSalesWhere(lastWeekStart, lastWeekEnd),
        _sum: { total: true },
      }),
      this.prisma.sale.count({
        where: {
          type: 'WEB_PICKUP',
          status: 'PENDIENTE_PAGO',
        },
      }),
      this.prisma.sale.count({
        where: { status: { in: ['PAGADO', 'EN_PREPARACION'] } },
      }),
      this.prisma.sale.count({
        where: { status: 'LISTO_DESPACHO' },
      }),
      this.computeLowStockCount(),
      this.prisma.purchaseSuggestion.count({
        where: { status: { in: ['PENDING', 'EVALUATED'] } },
      }),
    ]);

    const todayRevenue = Number(today._sum.total ?? 0);
    const todayDiscount = Number(today._sum.discountTotal ?? 0);
    const lastWeekRevenue = Number(lastWeekSameDay._sum.total ?? 0);
    const weekOverWeekPct =
      lastWeekRevenue > 0
        ? round4((todayRevenue - lastWeekRevenue) / lastWeekRevenue)
        : null;

    return {
      date: toDayBucket(now),
      todayCount: today._count,
      todayRevenue: round(todayRevenue),
      todayDiscount: round(todayDiscount),
      weekOverWeekPct,
      pendingWebOrders: pendingWeb,
      ordersInKitchen: inKitchen,
      ordersReady: ready,
      lowStockCount: lowStock,
      pendingSuggestions: pendingSugg,
    };
  }

  private async computeLowStockCount(): Promise<number> {
    // Stockables activos con thresholdMin > 0 cuyo stock actual está bajo.
    const [ingredients, products, movements] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: { isActive: true, thresholdMin: { gt: 0 } },
        select: { id: true, thresholdMin: true },
      }),
      this.prisma.product.findMany({
        where: { isActive: true, directResale: true, thresholdMin: { gt: 0 } },
        select: { id: true, thresholdMin: true },
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ['entityType', 'ingredientId', 'productId'],
        _sum: { delta: true },
      }),
    ]);

    const stockMap = new Map<string, number>();
    for (const r of movements) {
      const id = r.entityType === 'INGREDIENT' ? r.ingredientId : r.productId;
      if (!id) continue;
      const key = `${r.entityType}:${id}`;
      stockMap.set(key, Number(r._sum.delta ?? 0));
    }

    let count = 0;
    for (const i of ingredients) {
      const stock = stockMap.get(`INGREDIENT:${i.id}`) ?? 0;
      if (stock < Number(i.thresholdMin)) count++;
    }
    for (const p of products) {
      const stock = stockMap.get(`PRODUCT:${p.id}`) ?? 0;
      if (stock < Number(p.thresholdMin)) count++;
    }
    return count;
  }
}

// ====================================================================
// HELPERS
// ====================================================================

function paidSalesWhere(from: Date, to: Date): Prisma.SaleWhereInput {
  return {
    paidAt: { gte: from, lte: to, not: null },
    status: {
      notIn: ['PENDIENTE_PAGO', 'CANCELADO_NO_PAGO', 'VOID'],
    },
  };
}

function toDayBucket(d: Date): string {
  // YYYY-MM-DD en hora local del server (Bogotá).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toHourBucket(d: Date): string {
  // YYYY-MM-DDTHH:00 (hora local).
  return `${toDayBucket(d)}T${String(d.getHours()).padStart(2, '0')}:00`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// FASE 14.E: estimateProductCost (cálculo inline aproximado) removido.
// Ahora usamos RecipesService.expandedCost que expande recursivamente
// subproducts via expandRecipe + computeProductCost / computeComboCost.
