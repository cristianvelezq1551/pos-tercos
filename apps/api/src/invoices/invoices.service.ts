import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { LLMInvoiceExtractionResult, StorageProvider } from '@pos-tercos/domain';
import { buildCostIncreaseAlertMessage, roundCost, type CostIncreaseItem } from '@pos-tercos/domain';
import {
  ExtractedInvoiceSchema,
  type ConfirmInvoice,
  type ExtractedInvoice,
  type ExtractInvoiceResponse,
  type Invoice,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { LLMService } from '../adapters/llm/llm.service';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { extensionForMime, type SupportedImageMime } from '../common/image-mime';
import { InventoryService } from '../inventory/inventory.service';
import { OwnerNotificationService } from '../notifications/owner-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { includeFull, toInvoiceDto } from './invoices.mappers';

/** Suba de costo (vs último conocido) que dispara alerta WhatsApp al dueño. */
const COST_INCREASE_ALERT_PCT = 0.15;

/** Shape mínimo del insumo/producto cargado para confirmar una factura. */
interface ConfirmIngredient {
  id: string;
  isActive: boolean;
  name: string;
  unitPurchase: string;
  unitRecipe: string;
  conversionFactor: Prisma.Decimal;
  lastUnitCost: Prisma.Decimal | null;
}
interface ConfirmProduct {
  id: string;
  isActive: boolean;
  name: string;
  directResale: boolean;
  unitPurchase: string | null;
  unitStock: string | null;
  conversionFactor: Prisma.Decimal | null;
  lastUnitCost: Prisma.Decimal | null;
}

/**
 * Convierte cantidad declarada en factura a la unidad BASE de stock.
 *
 * Prioridad:
 *  1. `baseFactor` (verificado en la UI al confirmar, asistido por IA): unidades
 *     base por 1 unidad de la línea → stockQty = quantity × baseFactor. Es la
 *     fuente de verdad porque captura la conversión EXACTA de ESTA compra,
 *     aunque venga en una unidad distinta a la por defecto del insumo.
 *  2. Si la unidad declarada coincide con la unidad de stock → quantity (factor 1).
 *  3. Si no → quantity × conversionFactor (default del insumo).
 *
 * Ejemplo: "5 unidad" donde 1 unidad = 1500 g (pack 10×150) → baseFactor=1500
 *   → 5 × 1500 = 7500 g. Costo FIFO = total / 7500 (= $/g exacto).
 */
function computeStockQty(opts: {
  quantity: number;
  invoiceUnit: string;
  stockUnit: string;
  conversionFactor: number;
  baseFactor?: number;
}): number {
  if (opts.baseFactor != null && opts.baseFactor > 0) {
    return opts.quantity * opts.baseFactor;
  }
  if (opts.invoiceUnit.toLowerCase() === opts.stockUnit.toLowerCase()) {
    return opts.quantity;
  }
  return opts.quantity * opts.conversionFactor;
}

/**
 * Costo por unidad de stock para FIFO: el TOTAL real de la línea (lo que la
 * factura efectivamente cobró por ese ítem) dividido por las unidades de stock
 * recibidas. Usa `lineTotal`, NO `quantity × unitPrice`, porque una línea puede
 * traer descuento o IVA incluido (`total ≠ quantity × unitPrice`); el FIFO debe
 * costear lo que se PAGÓ. Coincide con lo que la UI le muestra al operador
 * (total ÷ unidades base). Null si no se puede calcular (delta 0).
 */
function stockUnitCost(lineTotal: number, stockQty: number): number | null {
  if (stockQty <= 0) return null;
  return roundCost(lineTotal / stockQty);
}

/**
 * Costo por unidad de COMPRA del insumo/producto, consistente con la conversión
 * REAL de la línea. = costo por unidad base × conversionFactor.
 *
 * Clave: el `unitPrice` de la factura está en la unidad de la LÍNEA (ej. $39.750
 * por paquete), que no siempre es la unidad de compra del insumo (Kg). Si la
 * compra entró con `baseFactor` (paquete de 1.500 g), este helper re-escala:
 *   perBase = $39.750/1.500 g = $26,5/g  →  ×1000 = $26.500/Kg  (no $39.750/Kg).
 * Así `lastUnitCost` queda fiel y el costo de productos/subproductos no se infla.
 */
function purchaseUnitCost(opts: {
  quantity: number;
  lineTotal: number;
  invoiceUnit: string;
  stockUnit: string;
  conversionFactor: number;
  baseFactor?: number;
}): number {
  const stockQty = computeStockQty(opts);
  const perBase = stockUnitCost(opts.lineTotal, stockQty);
  if (perBase === null) return opts.lineTotal;
  return roundCost(perBase * opts.conversionFactor);
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly suppliers: SuppliersService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly ownerNotifications: OwnerNotificationService,
  ) {}

  /**
   * FASE 15.A — Sweep semanal de archivos huérfanos en storage. Cuando
   * se borra un draft `PENDING_REVIEW` (o el `storage.delete` falla en
   * el flujo principal) puede quedar el binario sin row en la DB. Este
   * cron lo limpia.
   *
   * Estrategia:
   *  1. Listar todas las keys bajo prefix `invoices/`.
   *  2. Cargar `photoStorageKey` de TODAS las invoices (cualquier status).
   *  3. Borrar las keys del storage que NO aparecen en DB.
   *
   * Cron: domingo 5:00 AM (después de los crons diarios).
   */
  @Cron(CronExpression.EVERY_WEEK)
  async sweepOrphanInvoiceFilesScheduled(): Promise<void> {
    try {
      await this.sweepOrphanInvoiceFiles();
    } catch (err) {
      // El cron no debe propagar (el método sigue lanzando para el endpoint manual).
      this.logger.error('sweepOrphanInvoiceFiles (cron) falló', err as Error);
    }
  }

  async sweepOrphanInvoiceFiles(): Promise<{
    storageKeys: number;
    referencedKeys: number;
    deleted: number;
  }> {
    const [storageKeys, dbRows] = await Promise.all([
      this.storage.listKeys('invoices'),
      this.prisma.invoice.findMany({
        where: { photoStorageKey: { not: null } },
        select: { photoStorageKey: true },
      }),
    ]);
    const referenced = new Set(
      dbRows.map((r) => r.photoStorageKey).filter((k): k is string => k !== null),
    );
    let deleted = 0;
    for (const key of storageKeys) {
      if (referenced.has(key)) continue;
      try {
        await this.storage.delete(key);
        deleted++;
      } catch (err) {
        this.logger.warn(
          `sweep: failed to delete orphan ${key}: ${(err as Error).message}`,
        );
      }
    }
    if (deleted > 0) {
      this.logger.log(
        `sweep: ${deleted} archivos huérfanos limpiados de ${storageKeys.length} total (${referenced.size} referenced)`,
      );
    }
    return {
      storageKeys: storageKeys.length,
      referencedKeys: referenced.size,
      deleted,
    };
  }

  /**
   * Sube la foto al storage y extrae con IA, pero NO crea factura en DB. El
   * cliente recibe `{photoStorageKey, aiModelUsed, extraction}` y debe:
   *   - llamar `createFromPhoto` al confirmar (persiste + confirma en uno).
   *   - o llamar `discardPhoto` al abandonar (limpia la foto).
   * Si el cliente desaparece sin hacer ninguna, la foto queda huérfana hasta
   * que pase el `sweepOrphanInvoiceFiles` semanal.
   */
  async extractFromPhoto(input: {
    fileBuffer: Buffer;
    mimeType: SupportedImageMime;
    originalName: string;
    userId: string;
  }): Promise<ExtractInvoiceResponse> {
    const ext = extensionForMime(input.mimeType);
    const stored = await this.storage.put('invoices', input.fileBuffer, input.mimeType, ext);

    let llmResult: LLMInvoiceExtractionResult;
    try {
      llmResult = await this.llm.extractInvoice({
        imageBuffer: input.fileBuffer,
        mimeType: input.mimeType,
      });
    } catch (err) {
      // Si la IA falló, no dejamos la foto huérfana — limpiamos ya mismo.
      await this.storage.delete(stored.key).catch(() => {});
      throw new BadRequestException({
        message: 'IA no pudo extraer la factura. Probá con otra foto o cargala manualmente.',
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      photoStorageKey: stored.key,
      aiModelUsed: llmResult.modelUsed,
      extraction: llmResult.extraction,
    };
  }

  /**
   * Crear+confirmar factura desde foto (IA): único endpoint que persiste. Sin
   * draft intermedio. Asocia la foto previamente subida (`photoStorageKey`).
   */
  async createFromPhoto(
    input: ConfirmInvoice,
    photoStorageKey: string,
    aiModelUsed: string,
    userId: string,
  ): Promise<Invoice> {
    // Verifica que la foto siga existiendo en storage (anti-replay/race).
    const exists = await this.storage.url(photoStorageKey).catch(() => null);
    if (!exists) {
      throw new BadRequestException(
        'La foto ya no está disponible. Vuelve a subirla.',
      );
    }
    // Crea el invoice PENDING_REVIEW con la foto + modelo IA, y luego confirma.
    const created = await this.prisma.invoice.create({
      data: {
        photoStorageKey,
        aiModelUsed,
        aiExtractionJson: {} as Prisma.InputJsonValue,
        status: 'PENDING_REVIEW',
        uploadedById: userId,
      },
    });
    try {
      return await this.confirm(created.id, input, userId);
    } catch (err) {
      // Si confirm falla, limpia el invoice y la foto.
      await this.prisma.invoice.delete({ where: { id: created.id } }).catch(() => {});
      await this.storage.delete(photoStorageKey).catch(() => {});
      throw err;
    }
  }

  /** Limpia una foto subida que el usuario decidió no confirmar. */
  async discardPhoto(photoStorageKey: string): Promise<void> {
    await this.storage.delete(photoStorageKey).catch(() => {});
  }

  async list(opts: { status?: string; supplierId?: string; limit?: number } = {}): Promise<Invoice[]> {
    const where: Prisma.InvoiceWhereInput = {};
    if (opts.status) where.status = opts.status as Prisma.InvoiceWhereInput['status'];
    if (opts.supplierId) where.supplierId = opts.supplierId;
    const rows = await this.prisma.invoice.findMany({
      where,
      include: includeFull(),
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
    });
    return rows.map(toInvoiceDto);
  }

  async getById(id: string): Promise<Invoice> {
    const row = await this.prisma.invoice.findUnique({ where: { id }, include: includeFull() });
    if (!row) throw new NotFoundException(`Invoice ${id} not found`);
    return toInvoiceDto(row);
  }

  async getRawExtraction(id: string): Promise<ExtractedInvoice | null> {
    const row = await this.prisma.invoice.findUnique({
      where: { id },
      select: { aiExtractionJson: true },
    });
    if (!row?.aiExtractionJson) return null;
    const parsed = ExtractedInvoiceSchema.safeParse(row.aiExtractionJson);
    return parsed.success ? parsed.data : null;
  }

  async confirm(id: string, input: ConfirmInvoice, userId: string): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Invoice ${id} not found`);
    if (existing.status === 'CONFIRMED') {
      throw new BadRequestException('Invoice is already confirmed');
    }
    if (existing.status === 'REJECTED') {
      throw new BadRequestException('Invoice is rejected; cannot confirm');
    }

    const { ingredients, products } = await this.loadAndValidateEntities(input);
    this.assertInvoiceTotalsCoherent(input);

    const supplier = await this.suppliers.upsertByNit(input.supplierNit, input.supplierName);

    const updated = await this.prisma.$transaction(async (tx) => {
      const invoiceUpdated = await this.replaceItemsAndHeader(tx, id, input, supplier.id, userId);
      await this.writePurchaseMovements(tx, id, input, ingredients, products, supplier, userId);
      await this.upsertSupplierProductsAndCosts(tx, input, ingredients, products, supplier);
      return invoiceUpdated;
    });

    await this.audit.log({
      userId,
      action: 'INVOICE_CONFIRMED',
      entityType: 'invoice',
      entityId: id,
      metadata: {
        supplierId: supplier.id,
        supplierNit: supplier.nit,
        itemsCount: input.items.length,
        total: input.total,
      },
    });

    this.notifyCostIncreases(input, ingredients, products, supplier, id);

    void this.inventory; // (kept for future cross-domain calls)

    return toInvoiceDto(updated);
  }

  /** Carga insumos/productos referenciados y valida que existan, estén activos
   *  y (productos) sean direct-resale. Lanza BadRequest con el detalle. */
  private async loadAndValidateEntities(
    input: ConfirmInvoice,
  ): Promise<{ ingredients: ConfirmIngredient[]; products: ConfirmProduct[] }> {
    const ingredientIds = Array.from(
      new Set(
        input.items
          .filter((i) => i.entityType === 'INGREDIENT')
          .map((i) => i.ingredientId as string),
      ),
    );
    const productIds = Array.from(
      new Set(
        input.items
          .filter((i) => i.entityType === 'PRODUCT')
          .map((i) => i.productId as string),
      ),
    );

    const [ingredients, products] = await Promise.all([
      ingredientIds.length > 0
        ? this.prisma.ingredient.findMany({
            where: { id: { in: ingredientIds } },
            select: { id: true, isActive: true, name: true, unitPurchase: true, unitRecipe: true, conversionFactor: true, lastUnitCost: true },
          })
        : Promise.resolve([]),
      productIds.length > 0
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, isActive: true, name: true, directResale: true, unitPurchase: true, unitStock: true, conversionFactor: true, lastUnitCost: true },
          })
        : Promise.resolve([]),
    ]);

    const missingIng = ingredientIds.filter((iid) => !ingredients.some((i) => i.id === iid));
    if (missingIng.length > 0) {
      throw new BadRequestException(`Items refer to missing ingredients: ${missingIng.join(', ')}`);
    }
    const missingProd = productIds.filter((pid) => !products.some((p) => p.id === pid));
    if (missingProd.length > 0) {
      throw new BadRequestException(`Items refer to missing products: ${missingProd.join(', ')}`);
    }

    const inactiveIng = ingredients.filter((i) => !i.isActive).map((i) => i.id);
    if (inactiveIng.length > 0) {
      throw new BadRequestException(`Items refer to inactive ingredients: ${inactiveIng.join(', ')}`);
    }
    const notDirectResale = products.filter((p) => !p.directResale).map((p) => p.id);
    if (notDirectResale.length > 0) {
      throw new BadRequestException(
        `Products are not direct-resale (cannot have stock): ${notDirectResale.join(', ')}`,
      );
    }
    const inactiveProd = products.filter((p) => !p.isActive).map((p) => p.id);
    if (inactiveProd.length > 0) {
      throw new BadRequestException(`Items refer to inactive products: ${inactiveProd.join(', ')}`);
    }

    return { ingredients, products };
  }

  /** FASE 4 ajustes 2.3 + 2.4: el total declarado coincide (con tolerancia) con
   *  la suma de items, y el IVA no excede el total. */
  private assertInvoiceTotalsCoherent(input: ConfirmInvoice): void {
    const itemsSum = input.items.reduce((acc, it) => acc + Number(it.total), 0);
    const totalDelta = Math.abs(input.total - itemsSum);
    const totalTolerance = Math.max(input.total * 0.01, 1000);
    if (totalDelta > totalTolerance) {
      throw new BadRequestException(
        `Total de la factura ($${input.total.toLocaleString('es-CO')}) no coincide con la suma de items ($${itemsSum.toLocaleString('es-CO')}). Diferencia: $${totalDelta.toLocaleString('es-CO')} (tolerancia $${Math.round(totalTolerance).toLocaleString('es-CO')}).`,
      );
    }
    if (input.iva !== undefined && input.iva !== null && input.iva > input.total) {
      throw new BadRequestException(
        `IVA ($${input.iva.toLocaleString('es-CO')}) no puede ser mayor al total ($${input.total.toLocaleString('es-CO')}).`,
      );
    }
  }

  /** Reemplaza los invoice_items por los editados y actualiza el header de la
   *  factura a CONFIRMED. paymentStatus arranca en PENDING (confirmar = generó
   *  la obligación de pagar al proveedor). */
  private async replaceItemsAndHeader(
    tx: Prisma.TransactionClient,
    id: string,
    input: ConfirmInvoice,
    supplierId: string,
    userId: string,
  ) {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoiceItem.createMany({
      data: input.items.map((it, idx) => ({
        invoiceId: id,
        entityType: it.entityType,
        ingredientId: it.entityType === 'INGREDIENT' ? (it.ingredientId as string) : null,
        productId: it.entityType === 'PRODUCT' ? (it.productId as string) : null,
        descriptionRaw: it.descriptionRaw,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        total: it.total,
        sortOrder: idx,
      })),
    });

    return tx.invoice.update({
      where: { id },
      data: {
        supplierId,
        invoiceNumber: input.invoiceNumber ?? null,
        total: input.total,
        iva: input.iva ?? null,
        status: 'CONFIRMED',
        confirmedById: userId,
        confirmedAt: new Date(),
        notes: input.notes ?? null,
        paymentStatus: 'PENDING',
        paidAt: null,
        paymentProofKey: null,
        paymentActorId: null,
        paymentNote: null,
      },
      include: includeFull(),
    });
  }

  /** Movimientos PURCHASE por item: convierte la cantidad declarada (unidad de
   *  compra) a la unidad de stock y registra el costo por unidad de stock. */
  private async writePurchaseMovements(
    tx: Prisma.TransactionClient,
    id: string,
    input: ConfirmInvoice,
    ingredients: ConfirmIngredient[],
    products: ConfirmProduct[],
    supplier: { name: string },
    userId: string,
  ): Promise<void> {
    const notes = (invoiceNumber: string | null | undefined) =>
      `Factura ${invoiceNumber ?? id.slice(0, 8)} · ${supplier.name}`;
    for (const item of input.items) {
      if (item.entityType === 'INGREDIENT') {
        const ing = ingredients.find((i) => i.id === item.ingredientId);
        if (!ing) continue;
        const stockQty = computeStockQty({
          quantity: item.quantity,
          invoiceUnit: item.unit,
          stockUnit: ing.unitRecipe,
          conversionFactor: Number(ing.conversionFactor),
          baseFactor: item.baseFactor,
        });
        await tx.inventoryMovement.create({
          data: {
            entityType: 'INGREDIENT',
            ingredientId: item.ingredientId as string,
            delta: stockQty,
            // Costo por unidad de stock = total de la línea / unidades recibidas.
            unitCost: stockUnitCost(item.total, stockQty),
            type: 'PURCHASE',
            sourceType: 'invoice',
            sourceId: id,
            userId,
            notes: notes(input.invoiceNumber),
          },
        });
      } else {
        const prod = products.find((p) => p.id === item.productId);
        if (!prod) continue;
        const stockQty = computeStockQty({
          quantity: item.quantity,
          invoiceUnit: item.unit,
          stockUnit: prod.unitStock ?? 'unidad',
          conversionFactor: prod.conversionFactor !== null ? Number(prod.conversionFactor) : 1,
          baseFactor: item.baseFactor,
        });
        await tx.inventoryMovement.create({
          data: {
            entityType: 'PRODUCT',
            productId: item.productId as string,
            delta: stockQty,
            unitCost: stockUnitCost(item.total, stockQty),
            type: 'PURCHASE',
            sourceType: 'invoice',
            sourceId: id,
            userId,
            notes: notes(input.invoiceNumber),
          },
        });
      }
    }
  }

  /** Upsert de supplier_products (precio = COSTO al proveedor, en unidad de
   *  compra) + actualización de lastUnitCost del insumo/producto (re-escalado
   *  por la conversión real de la compra para no inflar el costo). */
  private async upsertSupplierProductsAndCosts(
    tx: Prisma.TransactionClient,
    input: ConfirmInvoice,
    ingredients: ConfirmIngredient[],
    products: ConfirmProduct[],
    supplier: { id: string },
  ): Promise<void> {
    for (const item of input.items) {
      if (item.entityType === 'INGREDIENT') {
        await tx.supplierProduct.upsert({
          where: {
            supplierId_ingredientId: {
              supplierId: supplier.id,
              ingredientId: item.ingredientId as string,
            },
          },
          create: {
            supplierId: supplier.id,
            entityType: 'INGREDIENT',
            ingredientId: item.ingredientId as string,
            lastUnitPrice: item.unitPrice,
            lastPurchaseDate: new Date(),
          },
          update: {
            lastUnitPrice: item.unitPrice,
            lastPurchaseDate: new Date(),
          },
        });

        const ingForCost = ingredients.find((i) => i.id === item.ingredientId);
        await tx.ingredient.update({
          where: { id: item.ingredientId as string },
          data: {
            lastUnitCost: ingForCost
              ? purchaseUnitCost({
                  quantity: item.quantity,
                  lineTotal: item.total,
                  invoiceUnit: item.unit,
                  stockUnit: ingForCost.unitRecipe,
                  conversionFactor: Number(ingForCost.conversionFactor),
                  baseFactor: item.baseFactor,
                })
              : item.unitPrice,
            lastUnitCostDate: new Date(),
          },
        });
      } else {
        await tx.supplierProduct.upsert({
          where: {
            supplierId_productId: {
              supplierId: supplier.id,
              productId: item.productId as string,
            },
          },
          create: {
            supplierId: supplier.id,
            entityType: 'PRODUCT',
            productId: item.productId as string,
            lastUnitPrice: item.unitPrice,
            lastPurchaseDate: new Date(),
          },
          update: {
            lastUnitPrice: item.unitPrice,
            lastPurchaseDate: new Date(),
          },
        });

        const prodForCost = products.find((p) => p.id === item.productId);
        await tx.product.update({
          where: { id: item.productId as string },
          data: {
            lastUnitCost: prodForCost
              ? purchaseUnitCost({
                  quantity: item.quantity,
                  lineTotal: item.total,
                  invoiceUnit: item.unit,
                  stockUnit: prodForCost.unitStock ?? 'unidad',
                  conversionFactor:
                    prodForCost.conversionFactor !== null ? Number(prodForCost.conversionFactor) : 1,
                  baseFactor: item.baseFactor,
                })
              : item.unitPrice,
            lastUnitCostDate: new Date(),
          },
        });
      }
    }
  }

  /** Alerta de costos (fire-and-forget): si algún item subió >=
   *  COST_INCREASE_ALERT_PCT vs el último costo conocido, avisa al dueño. */
  private notifyCostIncreases(
    input: ConfirmInvoice,
    ingredients: ConfirmIngredient[],
    products: ConfirmProduct[],
    supplier: { name: string },
    invoiceId: string,
  ): void {
    const increases: CostIncreaseItem[] = [];
    for (const item of input.items) {
      const prev =
        item.entityType === 'INGREDIENT'
          ? ingredients.find((i) => i.id === item.ingredientId)
          : products.find((p) => p.id === item.productId);
      const oldCost =
        prev?.lastUnitCost !== null && prev?.lastUnitCost !== undefined
          ? Number(prev.lastUnitCost)
          : null;
      if (oldCost === null || oldCost <= 0) continue;
      if (item.unitPrice >= oldCost * (1 + COST_INCREASE_ALERT_PCT)) {
        increases.push({ name: prev!.name, oldUnitCost: oldCost, newUnitCost: item.unitPrice });
      }
    }
    if (increases.length > 0) {
      void this.ownerNotifications.alert(
        'cost_increase',
        buildCostIncreaseAlertMessage({
          businessName: process.env.BUSINESS_NAME ?? 'Tercos',
          supplierName: supplier.name,
          items: increases,
        }),
        { invoiceId, items: increases.length },
      );
    }
  }

  /**
   * Clona una factura existente como draft PENDING_REVIEW. Copia
   * supplier, items (entityType + ingredientId/productId + descripción +
   * unidad + qty + precio) pero deja invoice_number/total/iva en null.
   * El dueño edita lo que cambió y confirma.
   */
  async cloneFrom(
    sourceInvoiceId: string,
    userId: string,
  ): Promise<{ invoice: Invoice; extraction: ExtractedInvoice }> {
    const source = await this.prisma.invoice.findUnique({
      where: { id: sourceInvoiceId },
      include: includeFull(),
    });
    if (!source) {
      throw new NotFoundException(`Source invoice ${sourceInvoiceId} not found`);
    }
    if (source.status !== 'CONFIRMED') {
      throw new BadRequestException(
        'Solo se pueden clonar facturas confirmadas. Reanudá la draft directamente.',
      );
    }
    // FASE 4 ajustes 2.12: rechazar source con 0 items (caso patológico
    // que dejaría una draft no-confirmable porque CreateInvoice exige >=1).
    if (source.items.length === 0) {
      throw new BadRequestException(
        'La factura origen no tiene items, no se puede clonar. Editala manualmente o subí una nueva.',
      );
    }

    const sourceShort = source.id.slice(0, 8);
    const supplierName = source.supplier?.name ?? null;
    const supplierNit = source.supplierId
      ? (await this.prisma.supplier.findUnique({
          where: { id: source.supplierId },
          select: { nit: true },
        }))?.nit ?? null
      : null;

    const synthExtraction: ExtractedInvoice = {
      supplierName,
      supplierNit,
      invoiceNumber: null,
      total: null,
      iva: null,
      items: source.items.map((it) => ({
        descriptionRaw: it.descriptionRaw,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        total: Number(it.total),
        // El desglose de empaque no se persiste en invoice_items (solo se usa al
        // crear el insumo). En un clon ya no aplica.
        packUnits: null,
        packSizePerUnit: null,
        packSizeMeasure: null,
      })),
      warnings: [`Clonado de factura ${sourceShort}. Revisá cantidades y precios antes de confirmar.`],
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          supplierId: source.supplierId,
          invoiceNumber: null,
          total: null,
          iva: null,
          status: 'PENDING_REVIEW',
          photoStorageKey: null,
          aiModelUsed: `manual-clone:${sourceShort}`,
          aiExtractionJson: synthExtraction as unknown as Prisma.InputJsonValue,
          uploadedById: userId,
        },
      });

      // Copiar items con entityType + ingredientId/productId + descripción + qty + price.
      // Mantenemos sortOrder para que el orden visual sea consistente.
      if (source.items.length > 0) {
        await tx.invoiceItem.createMany({
          data: source.items.map((it, idx) => ({
            invoiceId: inv.id,
            entityType: it.entityType,
            ingredientId: it.entityType === 'INGREDIENT' ? it.ingredientId : null,
            productId: it.entityType === 'PRODUCT' ? it.productId : null,
            descriptionRaw: it.descriptionRaw,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            total: it.total,
            sortOrder: idx,
          })),
        });
      }

      return tx.invoice.findUnique({ where: { id: inv.id }, include: includeFull() });
    });

    if (!created) {
      throw new BadRequestException('Failed to clone invoice');
    }

    await this.audit.log({
      userId,
      action: 'INVOICE_CLONED',
      entityType: 'invoice',
      entityId: created.id,
      metadata: {
        sourceInvoiceId,
        itemsCount: source.items.length,
      },
    });

    return {
      invoice: toInvoiceDto(created),
      extraction: synthExtraction,
    };
  }

  /**
   * Carga manual: crea la factura Y la confirma en un único flujo. No deja
   * borrador suelto si el usuario abandona — solo se persiste si llega a
   * confirmar. Si confirm() falla, limpia el invoice intermedio para no
   * dejar huérfanos.
   */
  async createManualConfirmed(
    input: ConfirmInvoice,
    userId: string,
  ): Promise<Invoice> {
    const blank = await this.createBlankDraft(userId);
    try {
      return await this.confirm(blank.invoice.id, input, userId);
    } catch (err) {
      // Limpia el borrador huérfano para que no quede ensuciando la lista.
      await this.prisma.invoice
        .delete({ where: { id: blank.invoice.id } })
        .catch(() => {});
      throw err;
    }
  }

  /**
   * Crea una factura en blanco (sin foto, sin IA). Se usa internamente desde
   * `createManualConfirmed`; no se expone como endpoint suelto (no queremos
   * borradores creados sin que el usuario confirme nada).
   */
  private async createBlankDraft(
    userId: string,
  ): Promise<{ invoice: Invoice; extraction: ExtractedInvoice }> {
    const blankExtraction: ExtractedInvoice = {
      supplierName: null,
      supplierNit: null,
      invoiceNumber: null,
      total: null,
      iva: null,
      items: [],
      warnings: ['Carga manual — la IA no extrajo datos. Ingresá proveedor, items y totales.'],
    };

    const created = await this.prisma.invoice.create({
      data: {
        supplierId: null,
        invoiceNumber: null,
        total: null,
        iva: null,
        status: 'PENDING_REVIEW',
        photoStorageKey: null,
        aiModelUsed: 'manual-blank',
        aiExtractionJson: blankExtraction as unknown as Prisma.InputJsonValue,
        uploadedById: userId,
      },
      include: includeFull(),
    });

    await this.audit.log({
      userId,
      action: 'INVOICE_UPLOADED',
      entityType: 'invoice',
      entityId: created.id,
      metadata: { source: 'manual' },
    });

    return {
      invoice: toInvoiceDto(created),
      extraction: blankExtraction,
    };
  }

  /**
   * FASE 4 ajustes 2.9: lee la foto original de la factura desde storage.
   * Devuelve null si la factura no tiene foto (ej. clonada manual).
   */
  async getPhoto(id: string): Promise<{ buffer: Buffer; key: string } | null> {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: { photoStorageKey: true },
    });
    if (!inv) throw new NotFoundException(`Invoice ${id} not found`);
    if (!inv.photoStorageKey) return null;
    const buffer = await this.storage.get(inv.photoStorageKey);
    return { buffer, key: inv.photoStorageKey };
  }

  /**
   * FASE 4 ajustes 2.10: borra un draft PENDING_REVIEW. Cascade borra
   * invoice_items vía FK. Si tiene foto en storage, también la borra.
   * NUNCA permite borrar CONFIRMED (preserva audit + movements) o REJECTED
   * (queda en histórico para trazabilidad).
   */
  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true, photoStorageKey: true },
    });
    if (!existing) throw new NotFoundException(`Invoice ${id} not found`);
    if (existing.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        `Solo se pueden borrar borradores PENDING_REVIEW (status actual: ${existing.status}). Para anular una factura confirmada usá REJECTED.`,
      );
    }

    await this.prisma.invoice.delete({ where: { id } });
    if (existing.photoStorageKey) {
      try {
        await this.storage.delete(existing.photoStorageKey);
      } catch (err) {
        // No falla la operación si storage falla — la DB ya commiteó.
        // El archivo huérfano lo limpia el cron sweepOrphanInvoiceFiles
        // semanal (FASE 15.A).
        console.warn(
          `[invoices.delete] storage.delete failed for ${existing.photoStorageKey}:`,
          err,
        );
      }
    }
    await this.audit.log({
      userId,
      action: 'INVOICE_DELETED',
      entityType: 'invoice',
      entityId: id,
      metadata: { hadPhoto: existing.photoStorageKey !== null },
    });
  }

  async reject(id: string, userId: string, reason?: string): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Invoice ${id} not found`);
    if (existing.status === 'CONFIRMED') {
      throw new BadRequestException('Cannot reject a confirmed invoice');
    }
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'REJECTED',
        notes: reason ?? existing.notes,
      },
      include: includeFull(),
    });
    await this.audit.log({
      userId,
      action: 'INVOICE_REJECTED',
      entityType: 'invoice',
      entityId: id,
      metadata: { reason },
    });
    return toInvoiceDto(updated);
  }
}
