import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { LLMInvoiceExtractionResult, StorageProvider } from '@pos-tercos/domain';
import {
  ExtractedInvoiceSchema,
  type ConfirmInvoice,
  type ExtractedInvoice,
  type Invoice,
  type InvoiceItem,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { LLMService } from '../adapters/llm/llm.service';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { AuditService } from '../audit/audit.service';
import { extensionForMime, type SupportedImageMime } from '../common/image-mime';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { SuppliersService } from '../suppliers/suppliers.service';

type DbInvoiceWithDetail = Prisma.InvoiceGetPayload<{
  include: {
    supplier: { select: { name: true } };
    uploadedBy: { select: { fullName: true } };
    confirmedBy: { select: { fullName: true } };
    items: {
      include: {
        ingredient: { select: { name: true } };
        product: { select: { name: true } };
      };
    };
  };
}>;

/**
 * Convierte cantidad declarada en factura (en unit_purchase) a la unit
 * de stock usando conversionFactor. Si la unidad declarada coincide con
 * la unit de stock, no convierte (factor=1 implícito).
 *
 * Ejemplo: factura dice "5 kg" de pollo, stock se mide en "g", factor=1000
 *   → 5 * 1000 = 5000 g a sumar al stock.
 */
function computeStockQty(opts: {
  quantity: number;
  invoiceUnit: string;
  stockUnit: string;
  conversionFactor: number;
}): number {
  if (opts.invoiceUnit.toLowerCase() === opts.stockUnit.toLowerCase()) {
    return opts.quantity;
  }
  return opts.quantity * opts.conversionFactor;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly suppliers: SuppliersService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async uploadPhoto(input: {
    fileBuffer: Buffer;
    /** MIME type DETECTED from magic bytes (controller already validated). */
    mimeType: SupportedImageMime;
    originalName: string;
    userId: string;
  }): Promise<{ invoice: Invoice; extraction: ExtractedInvoice }> {
    const ext = extensionForMime(input.mimeType);
    const stored = await this.storage.put('invoices', input.fileBuffer, input.mimeType, ext);

    let llmResult: LLMInvoiceExtractionResult;
    try {
      llmResult = await this.llm.extractInvoice({
        imageBuffer: input.fileBuffer,
        mimeType: input.mimeType,
      });
    } catch (err) {
      throw new BadRequestException({
        message: 'IA no pudo extraer la factura. Probá con otra foto o cargala manualmente.',
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    const created = await this.prisma.invoice.create({
      data: {
        photoStorageKey: stored.key,
        aiExtractionJson: llmResult.extraction as unknown as Prisma.InputJsonValue,
        aiModelUsed: llmResult.modelUsed,
        invoiceNumber: llmResult.extraction.invoiceNumber,
        total: llmResult.extraction.total ?? null,
        iva: llmResult.extraction.iva ?? null,
        status: 'PENDING_REVIEW',
        uploadedById: input.userId,
      },
      include: includeFull(),
    });

    await this.audit.log({
      userId: input.userId,
      action: 'INVENTORY_MOVEMENT_PURCHASE',
      entityType: 'invoice',
      entityId: created.id,
      metadata: {
        stage: 'uploaded',
        modelUsed: llmResult.modelUsed,
        warnings: llmResult.extraction.warnings,
      },
    });

    return {
      invoice: toInvoiceDto(created),
      extraction: llmResult.extraction,
    };
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

    // Particionar items por entityType para validar cada set
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
            select: { id: true, isActive: true, name: true, unitPurchase: true, unitRecipe: true, conversionFactor: true },
          })
        : Promise.resolve([]),
      productIds.length > 0
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, isActive: true, name: true, directResale: true, unitPurchase: true, unitStock: true, conversionFactor: true },
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

    const supplier = await this.suppliers.upsertByNit(input.supplierNit, input.supplierName);

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Replace invoice_items with user-edited ones
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

      // 2. Update invoice header
      const invoiceUpdated = await tx.invoice.update({
        where: { id },
        data: {
          supplierId: supplier.id,
          invoiceNumber: input.invoiceNumber ?? null,
          total: input.total,
          iva: input.iva ?? null,
          status: 'CONFIRMED',
          confirmedById: userId,
          confirmedAt: new Date(),
          notes: input.notes ?? null,
        },
        include: includeFull(),
      });

      // 3. Inventory movements (PURCHASE) per item.
      //    Convierte la cantidad declarada (en unit de compra) a la unit
      //    de stock usando conversionFactor.
      for (const item of input.items) {
        if (item.entityType === 'INGREDIENT') {
          const ing = ingredients.find((i) => i.id === item.ingredientId);
          if (!ing) continue;
          const stockQty = computeStockQty({
            quantity: item.quantity,
            invoiceUnit: item.unit,
            stockUnit: ing.unitRecipe,
            conversionFactor: Number(ing.conversionFactor),
          });
          await tx.inventoryMovement.create({
            data: {
              entityType: 'INGREDIENT',
              ingredientId: item.ingredientId as string,
              delta: stockQty,
              type: 'PURCHASE',
              sourceType: 'invoice',
              sourceId: id,
              userId,
              notes: `Factura ${input.invoiceNumber ?? id.slice(0, 8)} · ${supplier.name}`,
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
          });
          await tx.inventoryMovement.create({
            data: {
              entityType: 'PRODUCT',
              productId: item.productId as string,
              delta: stockQty,
              type: 'PURCHASE',
              sourceType: 'invoice',
              sourceId: id,
              userId,
              notes: `Factura ${input.invoiceNumber ?? id.slice(0, 8)} · ${supplier.name}`,
            },
          });
        }
      }

      // 4. Update supplier_products (solo para insumos, dado que la
      //    relación supplier_products tiene FK a ingredient_id).
      //    Para productos direct-resale podríamos tener una tabla análoga
      //    en el futuro; por ahora solo registramos histórico de insumos.
      for (const item of input.items) {
        if (item.entityType !== 'INGREDIENT') continue;
        await tx.supplierProduct.upsert({
          where: {
            supplierId_ingredientId: {
              supplierId: supplier.id,
              ingredientId: item.ingredientId as string,
            },
          },
          create: {
            supplierId: supplier.id,
            ingredientId: item.ingredientId as string,
            lastUnitPrice: item.unitPrice,
            lastPurchaseDate: new Date(),
          },
          update: {
            lastUnitPrice: item.unitPrice,
            lastPurchaseDate: new Date(),
          },
        });
      }

      return invoiceUpdated;
    });

    await this.audit.log({
      userId,
      action: 'INVENTORY_MOVEMENT_PURCHASE',
      entityType: 'invoice',
      entityId: id,
      metadata: {
        stage: 'confirmed',
        supplierId: supplier.id,
        supplierNit: supplier.nit,
        itemsCount: input.items.length,
        total: input.total,
      },
    });

    void this.inventory; // (kept for future cross-domain calls)

    return toInvoiceDto(updated);
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
      action: 'INVENTORY_MOVEMENT_PURCHASE',
      entityType: 'invoice',
      entityId: id,
      metadata: { stage: 'rejected', reason },
    });
    return toInvoiceDto(updated);
  }
}

function includeFull() {
  return {
    supplier: { select: { name: true } },
    uploadedBy: { select: { fullName: true } },
    confirmedBy: { select: { fullName: true } },
    items: {
      include: {
        ingredient: { select: { name: true } },
        product: { select: { name: true } },
      },
      orderBy: { sortOrder: 'asc' },
    },
  } satisfies Prisma.InvoiceInclude;
}

function toInvoiceDto(row: DbInvoiceWithDetail): Invoice {
  const items: InvoiceItem[] = row.items.map((it) => ({
    id: it.id,
    invoiceId: it.invoiceId,
    entityType: it.entityType,
    ingredientId: it.ingredientId,
    productId: it.productId,
    itemName:
      it.entityType === 'INGREDIENT'
        ? (it.ingredient?.name ?? null)
        : it.entityType === 'PRODUCT'
          ? (it.product?.name ?? null)
          : null,
    descriptionRaw: it.descriptionRaw,
    quantity: Number(it.quantity),
    unit: it.unit,
    unitPrice: Number(it.unitPrice),
    total: Number(it.total),
    sortOrder: it.sortOrder,
  }));
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    invoiceNumber: row.invoiceNumber,
    total: row.total !== null ? Number(row.total) : null,
    iva: row.iva !== null ? Number(row.iva) : null,
    photoStorageKey: row.photoStorageKey,
    aiModelUsed: row.aiModelUsed,
    status: row.status,
    uploadedById: row.uploadedById,
    uploadedByName: row.uploadedBy?.fullName ?? null,
    confirmedById: row.confirmedById,
    confirmedByName: row.confirmedBy?.fullName ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items,
  };
}
