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
    items: { include: { ingredient: { select: { name: true } } } };
  };
}>;

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

    // Validate ingredient IDs
    const ingredientIds = Array.from(new Set(input.items.map((i) => i.ingredientId)));
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      select: { id: true, isActive: true, name: true, unitPurchase: true, unitRecipe: true, conversionFactor: true },
    });
    const missing = ingredientIds.filter((id2) => !ingredients.some((i) => i.id === id2));
    if (missing.length > 0) {
      throw new BadRequestException(`Items reference missing ingredients: ${missing.join(', ')}`);
    }
    const inactive = ingredients.filter((i) => !i.isActive).map((i) => i.id);
    if (inactive.length > 0) {
      throw new BadRequestException(`Items reference inactive ingredients: ${inactive.join(', ')}`);
    }

    const supplier = await this.suppliers.upsertByNit(input.supplierNit, input.supplierName);

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Replace all invoice_items with the user-edited ones
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.createMany({
        data: input.items.map((it, idx) => ({
          invoiceId: id,
          ingredientId: it.ingredientId,
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
      //    Convertimos la cantidad de la unidad de compra a la de receta usando conversionFactor.
      for (const item of input.items) {
        const ing = ingredients.find((i) => i.id === item.ingredientId);
        if (!ing) continue;
        const factor = Number(ing.conversionFactor);
        const recipeQty =
          item.unit.toLowerCase() === ing.unitRecipe.toLowerCase()
            ? item.quantity
            : item.quantity * factor;

        await tx.inventoryMovement.create({
          data: {
            ingredientId: item.ingredientId,
            delta: recipeQty,
            type: 'PURCHASE',
            sourceType: 'invoice',
            sourceId: id,
            userId,
            notes: `Factura ${input.invoiceNumber ?? id.slice(0, 8)} · ${supplier.name}`,
          },
        });
      }

      // 4. Update supplier_products (last unit price + last purchase date)
      for (const item of input.items) {
        await tx.supplierProduct.upsert({
          where: {
            supplierId_ingredientId: {
              supplierId: supplier.id,
              ingredientId: item.ingredientId,
            },
          },
          create: {
            supplierId: supplier.id,
            ingredientId: item.ingredientId,
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
    items: { include: { ingredient: { select: { name: true } } }, orderBy: { sortOrder: 'asc' } },
  } satisfies Prisma.InvoiceInclude;
}

function toInvoiceDto(row: DbInvoiceWithDetail): Invoice {
  const items: InvoiceItem[] = row.items.map((it) => ({
    id: it.id,
    invoiceId: it.invoiceId,
    ingredientId: it.ingredientId,
    ingredientName: it.ingredient?.name ?? null,
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
