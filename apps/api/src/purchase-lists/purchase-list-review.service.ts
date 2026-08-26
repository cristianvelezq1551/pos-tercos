import { Injectable, Logger } from '@nestjs/common';
import {
  buildShortageListUserPrompt,
  normalizeConversionFactor,
  SHORTAGE_LIST_SYSTEM,
} from '@pos-tercos/domain';
import type { PurchaseList } from '@pos-tercos/types';
import { LLMService } from '../adapters/llm/llm.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseListsService } from './purchase-lists.service';

/** Ventana de consumo que se le muestra a la IA para juzgar si algo alcanza. */
const DIAS_DE_CONSUMO = 30;

/**
 * La IA revisa UNA cosa: si las cantidades de la lista alcanzan o quien compra
 * se va a quedar corto (decisión del dueño 2026-08-26). No opina de precios ni
 * de proveedores — para eso ya está la evaluación de las sugerencias.
 *
 * El dato que hace útil la revisión es el CONSUMO real de los últimos 30 días,
 * que sale de los movimientos de inventario. Sin él, la IA solo podría repetir
 * la aritmética del mínimo, que la pantalla ya muestra.
 */
@Injectable()
export class PurchaseListReviewService {
  private readonly logger = new Logger(PurchaseListReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly audit: AuditService,
    private readonly lists: PurchaseListsService,
  ) {}

  async review(listId: string, userId: string): Promise<PurchaseList> {
    const list = await this.lists.getById(listId);
    const consumo = await this.consumoPorItem(list);

    const userPrompt = buildShortageListUserPrompt({
      items: list.items.map((it) => {
        const factor = normalizeConversionFactor(it.conversionFactor);
        const key = it.ingredientId ?? it.productId ?? '';
        return {
          name: it.entityName,
          currentStock: it.currentStock,
          thresholdMin: it.thresholdMin,
          unitStock: it.unitStock,
          quantity: it.quantity,
          unitPurchase: it.unitPurchase,
          coverageStock: it.quantity * factor,
          consumo30d: consumo.get(key) ?? null,
        };
      }),
    });

    const { text, modelUsed } = await this.llm.complete({
      systemPrompt: SHORTAGE_LIST_SYSTEM,
      userPrompt,
      maxTokens: 300,
    });

    await this.prisma.purchaseList.update({
      where: { id: listId },
      data: { aiRationale: text, aiModel: modelUsed, aiEvaluatedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: 'PURCHASE_LIST_EVALUATED',
      entityType: 'purchase_list',
      entityId: listId,
      metadata: { modelUsed, items: list.items.length },
    });

    return this.lists.getById(listId);
  }

  /**
   * Cuánto SALIÓ de cada ítem en los últimos 30 días, en unidad de stock.
   *
   * Solo los deltas negativos: las compras y los ajustes hacia arriba no son
   * consumo. Se devuelve en positivo porque "consumiste 4.500 g" se lee mejor
   * que "-4.500".
   */
  private async consumoPorItem(list: PurchaseList): Promise<Map<string, number>> {
    const ids = list.items
      .map((i) => i.ingredientId ?? i.productId)
      .filter((x): x is string => x !== null);
    if (ids.length === 0) return new Map();

    const desde = new Date(Date.now() - DIAS_DE_CONSUMO * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.inventoryMovement.findMany({
      where: {
        createdAt: { gte: desde },
        delta: { lt: 0 },
        OR: [{ ingredientId: { in: ids } }, { productId: { in: ids } }],
      },
      select: { ingredientId: true, productId: true, delta: true },
    });

    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r.ingredientId ?? r.productId;
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + Math.abs(Number(r.delta)));
    }
    return map;
  }
}
