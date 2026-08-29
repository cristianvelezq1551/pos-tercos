import { Injectable } from '@nestjs/common';
import { roundCost, roundMoney } from '@pos-tercos/domain';
import type { InventoryUsageReport, InventoryUsageRow } from '@pos-tercos/types';
import { CogsService } from './cogs.service';
import { PrismaService } from '../prisma/prisma.service';

/** Consumo por cortesía y su anulación: se contabilizan en el estado
 *  financiero, no como pérdida operativa. Fuera de este reporte los DOS. */
const CORTESIA_SOURCE_TYPES = ['cortesia', 'cortesia_reversal'];
/** Anulación de merma: netea la merma original en vez de ser un ajuste. */
const WASTE_REVERSAL_SOURCE_TYPE = 'waste_reversal';
const STOCK_COUNT_SOURCE_TYPE = 'stock_count';

interface UsageAcc {
  entityType: 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';
  entityId: string;
  sales: number;
  productionOut: number;
  productionIn: number;
  purchased: number;
  waste: number;
  adjustments: number;
  /** Neto de los conteos físicos (negativo = faltó). */
  shortage: number;
}

/**
 * Reporte de uso y mermas por stockable. La idea: el consumo por VENTAS y
 * PRODUCCIÓN es el "teórico" (sale de las recetas); lo que se pierde fuera
 * de eso —mermas declaradas (WASTE) y faltantes de conteo físico
 * (MANUAL_ADJUSTMENT negativo)— es plata que se va sin pasar por la caja.
 *
 * Las dos pérdidas se valorizan por caminos distintos, y el DTO las separa:
 *   - MERMA: costo real del lote consumido (ledger FIFO), la misma fuente que
 *     el P&G. Los dos números coinciden siempre.
 *   - FALTANTE de conteo: solo se puede ESTIMAR al último precio de compra —
 *     un ajuste de inventario no pasa por resultados, así que el ledger no le
 *     atribuye lote. Va aparte para no dar por exacto lo que es aproximado.
 */
@Injectable()
export class InventoryUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cogs: CogsService,
  ) {}

  /**
   * Costo REAL de las mermas del rango, agrupado por stockable.
   *
   * Sale del ledger FIFO —la MISMA fuente que la línea "Mermas" del P&G— en vez
   * de multiplicar por el último precio de compra. Con el precio en movimiento
   * las dos formas divergen (una merma valía $2.564 acá y $1.709 en el P&G), y
   * dos cifras para la misma pérdida no dejan decidir a nadie. De paso, los
   * subproductos dejan de quedar sin valorizar: el ledger sí conoce su costo.
   */
  private async wasteCostByStockable(
    from: Date,
    to: Date,
  ): Promise<Map<string, { cost: number; estimated: boolean; pending: boolean }>> {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { type: 'WASTE', createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        entityType: true,
        ingredientId: true,
        productId: true,
        subproductId: true,
      },
    });
    if (movements.length === 0) return new Map();

    const costById = await this.cogs.getWasteCostByMovement(from);
    const out = new Map<string, { cost: number; estimated: boolean; pending: boolean }>();
    for (const m of movements) {
      const entityId = m.ingredientId ?? m.productId ?? m.subproductId;
      if (!entityId) continue;
      const key = `${m.entityType}:${entityId}`;
      const prev = out.get(key) ?? { cost: 0, estimated: false, pending: false };
      const c = costById.get(m.id);
      if (!c) {
        // Salvaguarda: el ledger no pudo costear esta merma. No debería pasar
        // —registrarla invalida su caché (`LedgerFreshnessService`) y el replay
        // siempre cubre el rango pedido—, pero si pasa, "todavía no lo sé" y
        // "no costó nada" son cosas distintas y este reporte no puede volver a
        // confundirlas.
        prev.pending = true;
        out.set(key, prev);
        continue;
      }
      out.set(key, {
        cost: roundCost(prev.cost + c.cost),
        // `unknownQty` (lote sin costo) y `estimatedCost` (faltante estimado al
        // último precio) significan lo mismo para quien lee: el número no es exacto.
        estimated: prev.estimated || c.estimatedCost > 0 || c.unknownQty > 0,
        pending: prev.pending,
      });
    }
    return out;
  }

  /**
   * Costo REAL de los faltantes de conteo por stockable. Calcado del helper de
   * merma: el ledger costea cada conteo (§7.v43) y este reporte lee ESA cifra
   * en vez de estimarla, para que la pérdida por ítem y la línea del P&G sean
   * el mismo número.
   */
  private async shrinkageCostByEntity(
    from: Date,
    to: Date,
  ): Promise<Map<string, { cost: number; estimated: boolean; pending: boolean }>> {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        sourceType: STOCK_COUNT_SOURCE_TYPE,
        createdAt: { gte: from, lte: to },
      },
      select: {
        sourceId: true,
        entityType: true,
        ingredientId: true,
        productId: true,
        subproductId: true,
        delta: true,
      },
    });
    if (movements.length === 0) return new Map();

    const costBySource = await this.cogs.getShrinkageCostBySource(from);
    const out = new Map<string, { cost: number; estimated: boolean; pending: boolean }>();
    const contados = new Set<string>();
    for (const m of movements) {
      const entityId = m.ingredientId ?? m.productId ?? m.subproductId;
      if (!entityId || !m.sourceId) continue;
      const key = `${m.entityType}:${entityId}`;
      const prev = out.get(key) ?? { cost: 0, estimated: false, pending: false };
      // Un conteo puede tener el movimiento del faltante Y el de su corrección:
      // el ledger ya devuelve el neto por conteo, así que se suma UNA vez.
      const dedupe = `${key}|${m.sourceId}`;
      if (contados.has(dedupe)) continue;
      contados.add(dedupe);
      const c = costBySource.get(m.sourceId);
      if (!c) {
        // Un conteo que encontró DE MÁS no tiene costo propio y eso es normal:
        // el ledger devuelve esas unidades atribuyéndolas al conteo que declaró
        // la pérdida, o sea al mes en que se perdió. Marcarlo como desconocido
        // contagiaba al ítem entero y borraba el costo —correcto— de los otros
        // conteos del período: la pantalla decía "sin valorizar" mientras el
        // P&G sí cobraba la pérdida. Solo un faltante DECLARADO (delta < 0) sin
        // costo es de verdad un "todavía no lo sé".
        if (Number(m.delta) < 0) {
          prev.pending = true;
          out.set(key, prev);
        } else if (!out.has(key)) {
          out.set(key, prev);
        }
        continue;
      }
      out.set(key, {
        cost: roundCost(prev.cost + c.cost),
        estimated: prev.estimated || c.estimatedCost > 0 || c.unknownQty > 0,
        pending: prev.pending,
      });
    }
    return out;
  }

  async getUsage(from: Date, to: Date): Promise<InventoryUsageReport> {
    const grouped = await this.prisma.inventoryMovement.groupBy({
      // `sourceType` va en el groupBy —no solo en el where— porque las REVERSAS
      // son `MANUAL_ADJUSTMENT` y hay que distinguirlas de un ajuste común para
      // netearlas contra la merma en vez de sumarlas a `adjustments` (ver abajo).
      by: ['entityType', 'ingredientId', 'productId', 'subproductId', 'type', 'sourceType'],
      // Las cortesías NO son merma ni faltante: su costo se contabiliza en el
      // estado financiero. Se excluyen —junto con su reversa, o el reverso
      // positivo quedaría contado como un ajuste que tapa faltantes reales—
      // para que "Uso y mermas" sea pura pérdida operativa.
      //
      // ⚠️ Gotcha Prisma: `{ not: 'cortesia' }` se traduce a SQL
      // `source_type <> 'cortesia'`, que es NULL (no TRUE) para filas con
      // source_type NULL → las EXCLUÍA. Las mermas/ajustes manuales (creados por
      // `createMovement`) tienen source_type NULL, así que el reporte se comía
      // TODAS las mermas declaradas a mano. El OR explícito incluye los NULL y
      // excluye solo las cortesías reales.
      where: {
        createdAt: { gte: from, lte: to },
        OR: [{ sourceType: null }, { sourceType: { notIn: CORTESIA_SOURCE_TYPES } }],
      },
      _sum: { delta: true },
    });

    const accByEntity = new Map<string, UsageAcc>();
    for (const g of grouped) {
      const entityId = g.ingredientId ?? g.productId ?? g.subproductId;
      if (!entityId) continue;
      const key = `${g.entityType}:${entityId}`;
      let acc = accByEntity.get(key);
      if (!acc) {
        acc = {
          entityType: g.entityType,
          entityId,
          sales: 0,
          productionOut: 0,
          productionIn: 0,
          purchased: 0,
          waste: 0,
          adjustments: 0,
          shortage: 0,
        };
        accByEntity.set(key, acc);
      }
      const delta = Number(g._sum.delta ?? 0);
      // Anulación de merma (§7.v18): es un `MANUAL_ADJUSTMENT` positivo, pero NO
      // es un ajuste de inventario — es la merma original que se deshace. Se
      // resta de `waste` para que este reporte cuente la MISMA pérdida que el
      // P&G (que ya la netea vía `waste_reversal` en el ledger FIFO). Sumarla a
      // `adjustments` dejaba la merma inflada para siempre acá y, peor, el neto
      // positivo cancelaba faltantes reales de conteo físico del mismo período.
      if (g.sourceType === WASTE_REVERSAL_SOURCE_TYPE) {
        acc.waste -= delta;
        continue;
      }
      switch (g.type) {
        case 'SALE':
          // Consumos negativos + reversos de anulación positivos → neto.
          acc.sales += -delta;
          break;
        case 'PRODUCTION':
          if (delta >= 0) acc.productionIn += delta;
          else acc.productionOut += -delta;
          break;
        case 'PURCHASE':
          acc.purchased += delta;
          break;
        case 'WASTE':
          acc.waste += -delta;
          break;
        case 'MANUAL_ADJUSTMENT':
          // Separadas a propósito, porque son cosas distintas:
          //  - conteo físico  → FALTANTE: pérdida real, con costo del lote.
          //  - ajuste a mano  → CORRECCIÓN de un dato mal cargado, sin costo.
          // Mezcladas, una reposición manual positiva tapaba un faltante y la
          // cantidad quedaba en cero justo donde había algo que mirar. Además
          // la cantidad y el costo salían de poblaciones distintas: el costo ya
          // viene solo de los conteos (§7.v43), así que la cantidad también.
          if (g.sourceType === STOCK_COUNT_SOURCE_TYPE) acc.shortage += delta;
          else acc.adjustments += delta;
          break;
        // INITIAL no es uso del período, es base.
      }
    }

    const ingredientIds: string[] = [];
    const productIds: string[] = [];
    const subproductIds: string[] = [];
    for (const acc of accByEntity.values()) {
      if (acc.entityType === 'INGREDIENT') ingredientIds.push(acc.entityId);
      else if (acc.entityType === 'PRODUCT') productIds.push(acc.entityId);
      else subproductIds.push(acc.entityId);
    }
    // Prisma con `in: []` devuelve vacío sin pegarle a la DB con escaneos.
    const [ingredients, products, subproducts] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: { id: { in: ingredientIds } },
        select: { id: true, name: true, unitRecipe: true, lastUnitCost: true, conversionFactor: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, unitStock: true, lastUnitCost: true, conversionFactor: true },
      }),
      this.prisma.subproduct.findMany({
        where: { id: { in: subproductIds } },
        select: { id: true, name: true, unit: true },
      }),
    ]);
    const wasteCosts = await this.wasteCostByStockable(from, to);
    const shrinkageCosts = await this.shrinkageCostByEntity(from, to);
    const ingMap = new Map(ingredients.map((i) => [i.id, i]));
    const prodMap = new Map(products.map((p) => [p.id, p]));
    const subMap = new Map(subproducts.map((s) => [s.id, s]));

    const rows: InventoryUsageRow[] = [];
    for (const acc of accByEntity.values()) {
      // Sin actividad relevante en el período → fuera del reporte.
      const hasActivity =
        acc.sales !== 0 ||
        acc.productionOut !== 0 ||
        acc.productionIn !== 0 ||
        acc.waste !== 0 ||
        acc.adjustments !== 0 ||
        // Un item cuya ÚNICA novedad del período es un faltante de conteo es
        // justo el que hay que ver: sin esta condición se caía del reporte.
        acc.shortage !== 0;
      if (!hasActivity) continue;

      let name = acc.entityId;
      let unit = '';
      let unitCost: number | null = null;
      if (acc.entityType === 'INGREDIENT') {
        const ing = ingMap.get(acc.entityId);
        if (!ing) continue;
        name = ing.name;
        unit = ing.unitRecipe;
        unitCost =
          ing.lastUnitCost !== null && Number(ing.conversionFactor) > 0
            ? Number(ing.lastUnitCost) / Number(ing.conversionFactor)
            : null;
      } else if (acc.entityType === 'PRODUCT') {
        const prod = prodMap.get(acc.entityId);
        if (!prod) continue;
        name = prod.name;
        unit = prod.unitStock ?? 'unit';
        // conversionFactor null en reventa = "se compra y vende por unidad"
        // (factor 1) — MISMO criterio que CogsService, o la misma merma vale
        // $X en el P&G y "desconocido" acá.
        const cf = prod.conversionFactor === null ? 1 : Number(prod.conversionFactor);
        unitCost =
          prod.lastUnitCost !== null && cf > 0 ? Number(prod.lastUnitCost) / cf : null;
      } else {
        const sub = subMap.get(acc.entityId);
        if (!sub) continue;
        name = sub.name;
        unit = sub.unit ?? 'unit';
        // El costo del subproducto es FIFO de su producción; sin estimación simple.
        unitCost = null;
      }

      const consumed = acc.sales + acc.productionOut;
      // `acc.waste` puede quedar NEGATIVO si en esta ventana se anuló una merma
      // registrada en una ventana anterior. El neto se muestra tal cual (es la
      // verdad: se recuperó más de lo que se tiró acá), pero el % y la plata
      // perdida se calculan sobre la parte positiva — un porcentaje de una
      // merma negativa no significa nada.
      const wasteForLoss = Math.max(0, acc.waste);
      const wastePct =
        consumed + wasteForLoss > 0 ? wasteForLoss / (consumed + wasteForLoss) : null;

      // Merma: costo REAL del lote (FIFO). Cuadra con el P&G al peso.
      // `null` = el ledger aún no procesó una merma recién registrada (≤60 s).
      const fifo = wasteCosts.get(`${acc.entityType}:${acc.entityId}`);
      const wasteCost = fifo?.pending ? null : roundMoney(Math.max(0, fifo?.cost ?? 0));

      // Faltante de conteo: desde §7.v43 el ledger SÍ lo costea, así que acá va
      // el costo REAL del lote que salió — la misma cifra que la línea del P&G.
      // Antes se estimaba con el último precio de compra, y eso dejaba dos
      // números distintos para la misma pérdida según qué pantalla se mirara.
      // Neto de los conteos: si uno declaró de menos y otro lo corrigió, el
      // faltante que queda es la diferencia, no el bruto del primero.
      const shortageQty = roundCost(Math.max(0, -acc.shortage));
      const faltanteFifo = shrinkageCosts.get(`${acc.entityType}:${acc.entityId}`);
      // Sin faltante neto no hay nada que valorizar: son $0, no "no lo sé". El
      // caso existe —un conteo que encuentra DE MÁS deja movimiento en el
      // período pero su costo se netea en el mes en que se declaró la pérdida,
      // así que este conteo no tiene entrada propia en el ledger— y marcarlo
      // como desconocido inflaba el contador de "sin poder valorizar" con
      // filas que no habían perdido nada.
      const shortageCost =
        shortageQty <= 0 ? 0
        : faltanteFifo === undefined || faltanteFifo.pending ? null
        : roundMoney(Math.max(0, faltanteFifo.cost));

      rows.push({
        entityType: acc.entityType,
        entityId: acc.entityId,
        name,
        unit,
        sales: roundCost(acc.sales),
        productionOut: roundCost(acc.productionOut),
        productionIn: roundCost(acc.productionIn),
        purchased: roundCost(acc.purchased),
        waste: roundCost(acc.waste),
        adjustments: roundCost(acc.adjustments),
        wastePct: wastePct !== null ? roundCost(wastePct) : null,
        unitCost,
        wasteCost,
        wasteCostEstimated: fifo?.estimated ?? false,
        shortageQty,
        shortageCost,
        shortageCostEstimated: shortageCost !== null && (faltanteFifo?.estimated ?? false),
        lostCost: roundMoney((wasteCost ?? 0) + (shortageCost ?? 0)),
      });
    }

    // Priorizar dónde se pierde plata: $ perdido desc, luego % merma desc.
    rows.sort((a, b) => {
      if (b.lostCost !== a.lostCost) return b.lostCost - a.lostCost;
      return (b.wastePct ?? 0) - (a.wastePct ?? 0);
    });

    const totalWasteCost = roundMoney(rows.reduce((acc, r) => acc + (r.wasteCost ?? 0), 0));
    const totalShortageCost = roundMoney(
      rows.reduce((acc, r) => acc + (r.shortageCost ?? 0), 0),
    );
    const unknownCostCount = rows.filter(
      (r) => r.shortageCost === null || r.wasteCost === null,
    ).length;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows,
      totalWasteCost,
      totalShortageCost,
      unknownCostCount,
    };
  }
}
