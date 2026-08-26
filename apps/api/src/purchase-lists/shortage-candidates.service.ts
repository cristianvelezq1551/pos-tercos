import { Injectable } from '@nestjs/common';
import { computeSuggestedPurchase, roundMoney } from '@pos-tercos/domain';
import type { ShortageCandidate, Stockable, StockableType } from '@pos-tercos/types';
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
      const candidato = toCandidate(s, costs.get(key) ?? null, lastSuppliers.get(key) ?? null);
      if (onlyBelowMinimum && !candidato.belowMinimum) continue;
      out.push(candidato);
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

  /**
   * Snapshot de UN ítem, para congelarlo al agregarlo a una lista.
   *
   * Consulta SOLO esa entidad. Antes pedía `list(false)` —el catálogo entero,
   * con la agregación completa de `inventory_movements` adentro— para quedarse
   * con una fila: armar una lista de 20 insumos a mano disparaba 20 recálculos
   * del inventario. Los filtros son los mismos que los de `list` (activo, y
   * en producto además reventa directa) para que "qué se puede agregar"
   * signifique lo mismo en el buscador y al agregar.
   */
  async snapshotOf(
    entityType: StockableType,
    entityId: string,
  ): Promise<ShortageCandidate | null> {
    // Los subproductos se producen, no se compran: `list` los filtra antes.
    if (entityType === 'SUBPRODUCT') return null;

    const comprable = await this.comprableConCosto(entityType, entityId);
    if (!comprable) return null;

    const [stockable, last] = await Promise.all([
      // Por el mismo mapeador que usa `list`: los campos de un renglón no
      // pueden depender de por dónde se pidió.
      this.inventory.getStockableById(entityType, entityId),
      this.lastSupplierOf(entityType, entityId),
    ]);
    return toCandidate(stockable, comprable.estUnitCost, last);
  }

  /** ¿Se puede comprar hoy? Devuelve su último costo de paso (misma fila). */
  private async comprableConCosto(
    entityType: StockableType,
    entityId: string,
  ): Promise<{ estUnitCost: number | null } | null> {
    const row =
      entityType === 'INGREDIENT'
        ? await this.prisma.ingredient.findFirst({
            where: { id: entityId, isActive: true },
            select: { lastUnitCost: true },
          })
        : await this.prisma.product.findFirst({
            where: { id: entityId, isActive: true, directResale: true },
            select: { lastUnitCost: true },
          });
    if (!row) return null;
    return { estUnitCost: row.lastUnitCost === null ? null : Number(row.lastUnitCost) };
  }

  /** Último proveedor de UN ítem. Espeja el orden de `loadLastSuppliers`. */
  private async lastSupplierOf(
    entityType: StockableType,
    entityId: string,
  ): Promise<{ id: string; name: string } | null> {
    const row = await this.prisma.supplierProduct.findFirst({
      where: {
        ...(entityType === 'INGREDIENT' ? { ingredientId: entityId } : { productId: entityId }),
        // `loadLastSuppliers` salta los inactivos ANTES de elegir, así que el
        // pick cae en el siguiente activo — filtrarlos acá es equivalente.
        supplier: { isActive: true },
      },
      orderBy: [{ lastPurchaseDate: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      select: { supplier: { select: { id: true, name: true } } },
    });
    return row ? { id: row.supplier.id, name: row.supplier.name } : null;
  }

  /** Costo total estimado de comprar `quantity` unidades de compra. */
  static estTotalFor(quantity: number, estUnitCost: number | null): number | null {
    return estUnitCost === null ? null : roundMoney(quantity * estUnitCost);
  }
}

/**
 * Stockable + costo + proveedor → candidato.
 *
 * ÚNICO lugar donde se arma un `ShortageCandidate`: lo usan el listado (que
 * resuelve todo en lote) y el snapshot de un ítem (que consulta solo el suyo).
 * Con el mapeo duplicado, un renglón agregado a mano y el mismo renglón
 * prellenado terminarían con datos distintos en el papel.
 */
function toCandidate(
  s: Stockable,
  estUnitCost: number | null,
  last: { id: string; name: string } | null,
): ShortageCandidate {
  const { deficitStock, suggestedQty } = computeSuggestedPurchase({
    currentStock: s.currentStock,
    thresholdMin: s.thresholdMin,
    conversionFactor: s.conversionFactor,
  });
  return {
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
    estUnitCost,
    belowMinimum: s.thresholdMin > 0 && s.currentStock < s.thresholdMin,
    lastSupplierId: last?.id ?? null,
    lastSupplierName: last?.name ?? null,
  };
}
