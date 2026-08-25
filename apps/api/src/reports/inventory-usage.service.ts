import { Injectable } from '@nestjs/common';
import { roundCost, roundMoney } from '@pos-tercos/domain';
import type { InventoryUsageReport, InventoryUsageRow } from '@pos-tercos/types';
import { PrismaService } from '../prisma/prisma.service';

/** Consumo por cortesía y su anulación: se contabilizan en el estado
 *  financiero, no como pérdida operativa. Fuera de este reporte los DOS. */
const CORTESIA_SOURCE_TYPES = ['cortesia', 'cortesia_reversal'];
/** Anulación de merma: netea la merma original en vez de ser un ajuste. */
const WASTE_REVERSAL_SOURCE_TYPE = 'waste_reversal';

interface UsageAcc {
  entityType: 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT';
  entityId: string;
  sales: number;
  productionOut: number;
  productionIn: number;
  purchased: number;
  waste: number;
  adjustments: number;
}

/**
 * Reporte de uso y mermas por stockable. La idea: el consumo por VENTAS y
 * PRODUCCIÓN es el "teórico" (sale de las recetas); lo que se pierde fuera
 * de eso —mermas declaradas (WASTE) y faltantes de conteo físico
 * (MANUAL_ADJUSTMENT negativo)— es plata que se va sin pasar por la caja.
 * Valorizado con el último costo de compra para priorizar dónde mirar.
 */
@Injectable()
export class InventoryUsageService {
  constructor(private readonly prisma: PrismaService) {}

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
          acc.adjustments += delta;
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
        acc.adjustments !== 0;
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
      // Pérdida = mermas declaradas + faltantes de conteo (ajustes negativos).
      const lostQty = wasteForLoss + Math.max(0, -acc.adjustments);
      const wasteCost =
        unitCost !== null && lostQty > 0 ? roundMoney(lostQty * unitCost) : unitCost !== null ? 0 : null;

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
      });
    }

    // Priorizar dónde se pierde plata: $ perdido desc, luego % merma desc.
    rows.sort((a, b) => {
      const costA = a.wasteCost ?? -1;
      const costB = b.wasteCost ?? -1;
      if (costB !== costA) return costB - costA;
      return (b.wastePct ?? 0) - (a.wastePct ?? 0);
    });

    const totalWasteCost = roundMoney(
      rows.reduce((acc, r) => acc + (r.wasteCost ?? 0), 0),
    );
    const unknownCostCount = rows.filter(
      (r) => r.wasteCost === null && (r.waste > 0 || r.adjustments < 0),
    ).length;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows,
      totalWasteCost,
      unknownCostCount,
    };
  }
}
