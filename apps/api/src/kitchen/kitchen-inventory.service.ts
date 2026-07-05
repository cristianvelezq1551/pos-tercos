import { Injectable } from '@nestjs/common';
import type {
  KitchenCount,
  KitchenCountResult,
  RegisterWaste,
  Stockable,
} from '@pos-tercos/types';
import { InventoryService } from '../inventory/inventory.service';
import { StockCountsService } from '../inventory/stock-counts.service';

/**
 * Operaciones de inventario que el COCINERO puede hacer desde la app de cocina.
 * Reutiliza los servicios de inventario (no duplica lógica de stock/ledger);
 * solo restringe lo que la cocina puede tocar: ver stock (sin costos), registrar
 * MERMA y registrar CONTEO físico ciego. Nunca ajustes manuales arbitrarios ni
 * recepción de mercadería (eso entra por facturas en admin).
 */
@Injectable()
export class KitchenInventoryService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly stockCounts: StockCountsService,
  ) {}

  /**
   * Stock de cocina: insumos + subproductos + productos de reventa, activos.
   * `Stockable` NO expone costos (lastUnitCost) — solo cantidades. Se mantiene
   * `basePrice` (precio de venta, no sensible) por si la UI lo quiere mostrar.
   */
  listStock(): Promise<Stockable[]> {
    return this.inventory.listStockables({ onlyActive: true });
  }

  /** Registra una merma (WASTE) como movement negativo. Motivo obligatorio. */
  async registerWaste(input: RegisterWaste, userId: string): Promise<Stockable> {
    await this.inventory.createMovement(
      {
        entityType: input.entityType,
        ingredientId: input.ingredientId,
        productId: input.productId,
        subproductId: input.subproductId,
        delta: -Math.abs(input.quantity),
        type: 'WASTE',
        notes: input.reason,
      },
      userId,
    );
    const entityId =
      input.entityType === 'INGREDIENT'
        ? input.ingredientId!
        : input.entityType === 'PRODUCT'
          ? input.productId!
          : input.subproductId!;
    return this.inventory.getStockableById(input.entityType, entityId);
  }

  /**
   * Conteo físico CIEGO (batch): el cocinero ingresa lo contado. Cada ítem queda
   * PENDIENTE de aprobación del admin (#7) — NO ajusta stock todavía. Sigue siendo
   * ciego: no revela lo esperado ni la diferencia. `adjusted` queda en 0 porque
   * nada se ajusta hasta que el admin apruebe.
   */
  async registerCount(input: KitchenCount, userId: string): Promise<KitchenCountResult> {
    for (const item of input.items) {
      await this.stockCounts.register(
        {
          entityType: item.entityType,
          ingredientId: item.ingredientId,
          productId: item.productId,
          subproductId: item.subproductId,
          countedQty: item.countedQty,
          notes: input.notes,
        },
        userId,
        { autoApprove: false },
      );
    }
    return { counted: input.items.length, adjusted: 0 };
  }
}
