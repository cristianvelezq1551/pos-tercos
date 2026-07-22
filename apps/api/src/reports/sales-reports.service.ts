import { Injectable, Logger } from '@nestjs/common';
import { WEB_SALE_TYPES, type SaleType } from '@pos-tercos/types';
import {
  DAILY_SUMMARY_SYSTEM,
  buildDailySummaryUserPrompt,
  type DailySummaryInput,
} from '@pos-tercos/domain';
import {
  NON_REVENUE_SALE_STATUSES,
  type AiSummary,
  type DashboardSummary,
  type HourHeatmapReport,
  type Sale,
  type SalesGranularity,
  type SalesSummary,
  type SuggestionsMetrics,
  type TopProductsReport,
  type WhatsAppMetrics,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { LLMService } from '../adapters/llm/llm.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { includeFull, toSaleDto } from '../sales/sales.mappers';

/** Techo del listado detallado — evita cargar miles de filas de golpe. */
const SALES_DETAIL_MAX = 1000;

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
    private readonly inventory: InventoryService,
  ) {}

  // ==================================================================
  // RESUMEN DIARIO CON IA (lenguaje natural para el dueño)
  // ==================================================================

  async getDailyAiSummary(date: Date): Promise<AiSummary> {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const [summary, top, shift, lowStock] = await Promise.all([
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
        payments: { select: { method: true, amount: true } },
      },
    });

    // Total / avg / discount / count + voidCount. Las anuladas se cuentan por
    // paidAt — el MISMO eje temporal que el revenue del summary: el void cae
    // en el día en que esa venta se había COBRADO (su plata salió de ese día),
    // no en el día en que se anuló.
    const voidCount = await this.prisma.sale.count({
      where: {
        status: 'VOID',
        paidAt: { gte: from, lte: to },
      },
    });

    let revenue = 0;
    let discount = 0;
    const buckets = new Map<string, { count: number; revenue: number; discount: number }>();
    const byType = new Map<string, { count: number; revenue: number }>();
    const byMethod = new Map<string, { count: number; revenue: number }>();

    for (const s of sales) {
      // El envío SÍ cuenta: el reparto es un servicio que el negocio vende
      // (decisión del dueño 2026-07-17). Lo que se le paga al domiciliario es un
      // GASTO aparte, registrado en su módulo — así tesorería cuadra sola sin
      // que nadie tenga que excluir nada.
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

      // Por método desde sale_payments: la plata de una cuenta dividida cae
      // en CADA método por su parte (count = pagos, no ventas).
      for (const pay of s.payments) {
        const m = byMethod.get(pay.method) ?? { count: 0, revenue: 0 };
        m.count += 1;
        m.revenue += Number(pay.amount);
        byMethod.set(pay.method, m);
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
        type: type as SaleType,
        count: v.count,
        revenue: round(v.revenue),
      })),
      byMethod: Array.from(byMethod.entries()).map(([method, v]) => ({
        method,
        count: v.count,
        revenue: round(v.revenue),
      })),
    };
  }

  // ==================================================================
  // DETALLE DE VENTAS (listado del reporte, mismo universo que el resumen)
  // ==================================================================

  /**
   * Ventas pagadas del período (mismo filtro `paidSalesWhere` que el resumen),
   * con items + pagos, ordenadas por `paidAt` desc. Alimenta el listado
   * detallado bajo el resumen en `/reports/sales`.
   */
  async getSalesDetail(from: Date, to: Date): Promise<Sale[]> {
    return this.findSalesDetail(paidSalesWhere(from, to));
  }

  /**
   * Ventas pagadas de UNA caja (arqueo), sin ventana de fechas: la sesión
   * puede cruzar medianoche y ese es justamente el punto — muestra lo que
   * entró en esa caja tal como lo cuadra el Z-report (agrupa por shiftId).
   */
  async getSalesDetailByShift(shiftId: string): Promise<Sale[]> {
    return this.findSalesDetail({
      shiftId,
      paidAt: { not: null },
      status: { notIn: [...NON_REVENUE_SALE_STATUSES] },
    });
  }

  private async findSalesDetail(where: Prisma.SaleWhereInput): Promise<Sale[]> {
    const rows = await this.prisma.sale.findMany({
      where,
      include: includeFull(),
      orderBy: { paidAt: 'desc' },
      take: SALES_DETAIL_MAX,
    });
    return rows.map(toSaleDto);
  }

  // ==================================================================
  // TOP PRODUCTS
  // ==================================================================

  async getTopProducts(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<TopProductsReport> {
    // §5.4 (aproximación documentada): el ranking (qué productos entran al top-N
    // y su orden) se hace por Σ lineTotal BRUTO en la DB. El revenue MOSTRADO
    // resta el prorrateo del descuento de orden (abajo). En ventas sin descuento
    // sobre el total —el caso común— ambos coinciden; con descuentos de orden
    // grandes y muy desparejos el orden del ranking puede diferir levemente del
    // revenue neto. Ordenar por neto exigiría traer TODOS los productos (sin
    // `take`) y re-ordenar en memoria — no vale el costo para este reporte.
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: paidSalesWhere(from, to) },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: limit,
    });

    // Descuento manual SOBRE EL TOTAL (#5b): no vive en las líneas → sin este
    // prorrateo el revenue del ranking quedaba inflado (Σ lineTotal >
    // sale.total) y no conciliaba con el summary. Se reparte el descuento de
    // cada venta entre sus productos por el peso de cada línea.
    const orderDiscounted = await this.prisma.sale.findMany({
      where: { ...paidSalesWhere(from, to), orderDiscountAmount: { gt: 0 } },
      select: {
        orderDiscountAmount: true,
        items: { select: { productId: true, lineTotal: true } },
      },
    });
    const orderDiscountByProduct = new Map<string, number>();
    for (const s of orderDiscounted) {
      const saleLineSum = s.items.reduce((a, it) => a + Number(it.lineTotal), 0);
      if (saleLineSum <= 0) continue;
      const factor = Number(s.orderDiscountAmount) / saleLineSum;
      for (const it of s.items) {
        orderDiscountByProduct.set(
          it.productId,
          (orderDiscountByProduct.get(it.productId) ?? 0) + Number(it.lineTotal) * factor,
        );
      }
    }

    const productIds = grouped.map((g) => g.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Costo unitario recursivo real (incluye subproducts/combos). Antes se
    // llamaba `expandedCost(id)` por producto → cada llamada recargaba el grafo
    // completo (N+1 de grafos). `listProductCosts()` carga el grafo UNA vez y
    // computa todos los costos en memoria con la MISMA función pura
    // (computeProductCost/computeComboCost) → costo idéntico por producto
    // (verificado número-a-número sobre el catálogo). Cero cambio de costeo.
    const costByProduct = new Map(
      (await this.recipes.listProductCosts()).map((c) => [c.productId, c.totalCost]),
    );

    const result = grouped.map((g) => {
      const product = productMap.get(g.productId);
      const productName = product?.name ?? '(producto eliminado)';
      const quantity = Number(g._sum.quantity ?? 0);
      const revenue =
        Number(g._sum.lineTotal ?? 0) - (orderDiscountByProduct.get(g.productId) ?? 0);

      const estCostPerUnit = product ? (costByProduct.get(g.productId) ?? null) : null;
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
    });

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
    // Ambos tipos web: un domicilio también dispara notificaciones.
    const webSales = await this.prisma.sale.findMany({
      where: {
        type: { in: [...WEB_SALE_TYPES] },
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

    // Mensajes WhatsApp realmente enviados (status='sent') de estos pedidos web.
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

    const [today, lastWeekSameDay, pendingWeb, toPrepare, ready, lowStock, pendingSugg, negativeStock] = await Promise.all([
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
          type: { in: [...WEB_SALE_TYPES] },
          status: 'PENDIENTE_PAGO',
        },
      }),
      // Pedidos WEB pagados que el cajero aún debe marcar "listo". Solo los
      // web: el mostrador (COUNTER) termina en PAGADO y NO entra a esta cola
      // (si no, cada venta de caja inflaría el contador para siempre).
      this.prisma.sale.count({
        where: { type: { in: [...WEB_SALE_TYPES] }, status: 'PAGADO' },
      }),
      // Pedidos WEB marcados "listos" hoy (acotado al día para que no acumule
      // indefinidamente — LISTO_DESPACHO es terminal).
      this.prisma.sale.count({
        where: {
          type: { in: [...WEB_SALE_TYPES] },
          status: 'LISTO_DESPACHO',
          readyAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      this.computeLowStockCount(),
      this.prisma.purchaseSuggestion.count({
        where: { status: { in: ['PENDING', 'EVALUATED'] } },
      }),
      // Deuda de inventario (stock < 0). Se delega en InventoryService para que
      // el contador del dashboard NO pueda divergir de la lista de /inventory
      // /negativos (incluye subproductos e ignora el umbral, a diferencia de
      // computeLowStockCount).
      this.computeNegativeStockCount(),
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
      webOrdersToPrepare: toPrepare,
      webOrdersReady: ready,
      lowStockCount: lowStock,
      pendingSuggestions: pendingSugg,
      negativeStockCount: negativeStock,
    };
  }

  /**
   * Stockables con stock NEGATIVO (deuda de inventario). Excluye los
   * CONSUMIBLES (servilletas, sal): su negativo es esperable y taparía la
   * señal que importa ("falta subir la factura del pollo").
   */
  private async computeNegativeStockCount(): Promise<number> {
    const negatives = await this.inventory.listStockables({ negative: true });
    return negatives.filter((s) => s.blocksAvailability).length;
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
      // CANCELADO_SIN_REEMBOLSO sí cuenta como ingreso (no está en la lista).
      notIn: [...NON_REVENUE_SALE_STATUSES],
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
