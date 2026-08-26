import { Injectable } from '@nestjs/common';
import { computeSuggestedPurchase, roundMoney } from '@pos-tercos/domain';
import type { ShortageCandidate, StockableType } from '@pos-tercos/types';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lo que el formulario de faltantes ofrece para elegir: cada insumo/producto
 * comprable con sus existencias, su mínimo, cuánto falta y a quién se le
 * compró la última vez.
 *
 * Vive aparte del service de listas porque es una consulta de LECTURA sobre
 * varios dominios (inventario, costos, proveedores) y no toca ninguna lista.
 */
@Injectable()
export class ShortageCandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * @param onlyBelowMinimum true = solo lo que está bajo el mínimo (el arranque
   *   normal). false = todo el catálogo comprable, para agregar a mano algo que
   *   todavía no bajó pero se sabe que se va a acabar.
   */
  async list(onlyBelowMinimum = false): Promise<ShortageCandidate[]> {
    const stockables = await this.inventory.listStockables({ onlyActive: true });

    // Los SUBPRODUCTOS se producen, no se compran: no son candidatos.
    const comprables = stockables.filter((s) => s.type !== 'SUBPRODUCT');

    const [costs, lastSuppliers] = await Promise.all([
      this.loadCosts(),
      this.loadLastSuppliers(),
    ]);

    const out: ShortageCandidate[] = [];
    for (const s of comprables) {
      const key = `${s.type}:${s.id}`;
      const belowMinimum = s.thresholdMin > 0 && s.currentStock < s.thresholdMin;
      if (onlyBelowMinimum && !belowMinimum) continue;

      const { deficitStock, suggestedQty } = computeSuggestedPurchase({
        currentStock: s.currentStock,
        thresholdMin: s.thresholdMin,
        conversionFactor: s.conversionFactor,
      });
      const last = lastSuppliers.get(key);

      out.push({
        entityType: s.type as StockableType,
        entityId: s.id,
        name: s.name,
        unitPurchase: s.unitPurchase,
        unitStock: s.unitStock,
        conversionFactor: s.conversionFactor,
        currentStock: s.currentStock,
        thresholdMin: s.thresholdMin,
        deficitStock,
        suggestedQty,
        estUnitCost: costs.get(key) ?? null,
        belowMinimum,
        lastSupplierId: last?.id ?? null,
        lastSupplierName: last?.name ?? null,
      });
    }

    // Lo que falta primero, y dentro de eso lo más urgente arriba: quien arma
    // la lista no debería tener que buscar lo importante.
    return out.sort((a, b) => {
      if (a.belowMinimum !== b.belowMinimum) return a.belowMinimum ? -1 : 1;
      if (a.belowMinimum) return b.deficitStock - a.deficitStock;
      return a.name.localeCompare(b.name);
    });
  }

  /** Costo por unidad de COMPRA (el mismo que usan las sugerencias). */
  private async loadCosts(): Promise<Map<string, number | null>> {
    const [ingredients, products] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: { isActive: true },
        select: { id: true, lastUnitCost: true },
      }),
      this.prisma.product.findMany({
        where: { isActive: true, directResale: true },
        select: { id: true, lastUnitCost: true },
      }),
    ]);
    const map = new Map<string, number | null>();
    for (const r of ingredients) {
      map.set(`INGREDIENT:${r.id}`, r.lastUnitCost === null ? null : Number(r.lastUnitCost));
    }
    for (const r of products) {
      map.set(`PRODUCT:${r.id}`, r.lastUnitCost === null ? null : Number(r.lastUnitCost));
    }
    return map;
  }

  /**
   * Último proveedor por ítem, para prellenar el selector.
   *
   * NULLS LAST explícito: en Postgres un DESC deja los nulos PRIMERO, así que
   * un proveedor sin fecha de compra se coronaría "el último".
   */
  private async loadLastSuppliers(): Promise<Map<string, { id: string; name: string }>> {
    const rows = await this.prisma.supplierProduct.findMany({
      select: {
        ingredientId: true,
        productId: true,
        supplier: { select: { id: true, name: true, isActive: true } },
      },
      orderBy: [
        { lastPurchaseDate: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
    });
    const map = new Map<string, { id: string; name: string }>();
    for (const r of rows) {
      if (!r.supplier.isActive) continue;
      const key = r.ingredientId ? `INGREDIENT:${r.ingredientId}` : `PRODUCT:${r.productId}`;
      // El primero que aparece es el más reciente (ya viene ordenado).
      if (!map.has(key)) map.set(key, { id: r.supplier.id, name: r.supplier.name });
    }
    return map;
  }

  /** Snapshot de UN ítem, para congelarlo al agregarlo a una lista. */
  async snapshotOf(
    entityType: StockableType,
    entityId: string,
  ): Promise<ShortageCandidate | null> {
    const all = await this.list(false);
    return all.find((c) => c.entityType === entityType && c.entityId === entityId) ?? null;
  }

  /** Costo total estimado de comprar `quantity` unidades de compra. */
  static estTotalFor(quantity: number, estUnitCost: number | null): number | null {
    return estUnitCost === null ? null : roundMoney(quantity * estUnitCost);
  }
}
