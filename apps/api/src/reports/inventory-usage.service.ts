import { Injectable } from '@nestjs/common';
import { roundCost, roundMoney } from '@pos-tercos/domain';
import type { InventoryUsageReport, InventoryUsageRow } from '@pos-tercos/types';
import { PrismaService } from '../prisma/prisma.service';

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
      by: ['entityType', 'ingredientId', 'productId', 'subproductId', 'type'],
      // Las cortesías NO son merma ni faltante: su costo se contabiliza en el
      // estado financiero. Se excluyen para que "Uso y mermas" sea pura
      // pérdida operativa (mermas + faltantes + ajustes reales).
      //
      // ⚠️ Gotcha Prisma: `{ not: 'cortesia' }` se traduce a SQL
      // `source_type <> 'cortesia'`, que es NULL (no TRUE) para filas con
      // source_type NULL → las EXCLUÍA. Las mermas/ajustes manuales (creados por
      // `createMovement`) tienen source_type NULL, así que el reporte se comía
      // TODAS las mermas declaradas a mano. El OR explícito incluye los NULL y
      // excluye solo las cortesías reales.
      where: {
        createdAt: { gte: from, lte: to },
        OR: [{ sourceType: null }, { sourceType: { not: 'cortesia' } }],
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
        unitCost =
          prod.lastUnitCost !== null && prod.conversionFactor !== null && Number(prod.conversionFactor) > 0
            ? Number(prod.lastUnitCost) / Number(prod.conversionFactor)
            : null;
      } else {
        const sub = subMap.get(acc.entityId);
        if (!sub) continue;
        name = sub.name;
        unit = sub.unit ?? 'unit';
        // El costo del subproducto es FIFO de su producción; sin estimación simple.
        unitCost = null;
      }

      const consumed = acc.sales + acc.productionOut;
      const wastePct =
        consumed + acc.waste > 0 ? acc.waste / (consumed + acc.waste) : null;
      // Pérdida = mermas declaradas + faltantes de conteo (ajustes negativos).
      const lostQty = acc.waste + Math.max(0, -acc.adjustments);
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
