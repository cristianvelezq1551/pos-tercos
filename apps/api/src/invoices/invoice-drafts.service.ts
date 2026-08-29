import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { INVOICE_STATUS_LABELS, type ExtractedInvoice, type Invoice, type SaveInvoiceDraft } from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { includeFull, toInvoiceDto } from './invoices.mappers';
import { InvoicesService } from './invoices.service';

/**
 * Guardar una factura como BORRADOR, para releerla antes de que entre a los
 * libros.
 *
 * Un borrador no existe para nadie más que para esta pantalla: no genera
 * movimientos de inventario, no toca costos, no crea proveedores y no aparece
 * en tesorería ni en ningún reporte (todos filtran por `CONFIRMED`). Por eso
 * borrarlo es gratis y confirmarlo es la única acción que mueve algo.
 *
 * Valida EXACTAMENTE lo mismo que confirmar —reusando el validador de
 * `InvoicesService`, no una copia— para que un borrador siempre se pueda
 * confirmar tal como quedó guardado.
 */
@Injectable()
export class InvoiceDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
  ) {}

  /** Crea el borrador. Flujo IA (con foto) o carga manual (sin ella). */
  async save(input: SaveInvoiceDraft, userId: string): Promise<Invoice> {
    this.assertPhotoPairing(input);
    await this.invoices.assertPayloadConfirmable(input);

    const created = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          // El proveedor NO se crea todavía: un borrador que se termina
          // borrando no debe dejar un proveedor suelto en el catálogo. El
          // NIT y el nombre viajan en la extracción y el confirm los upserta.
          supplierId: null,
          invoiceNumber: input.invoiceNumber ?? null,
          total: input.total,
          iva: input.iva ?? null,
          freightAmount: input.freight ?? 0,
          notes: input.notes ?? null,
          status: 'PENDING_REVIEW',
          photoStorageKey: input.photoStorageKey ?? null,
          aiModelUsed: input.aiModelUsed ?? null,
          aiExtractionJson: buildDraftExtraction(input) as unknown as Prisma.InputJsonValue,
          uploadedById: userId,
        },
      });
      await tx.invoiceItem.createMany({ data: itemRows(inv.id, input) });
      return inv.id;
    });

    await this.audit.log({
      userId,
      action: 'INVOICE_DRAFT_SAVED',
      entityType: 'invoice',
      entityId: created,
      metadata: {
        itemsCount: input.items.length,
        total: input.total,
        fromPhoto: input.photoStorageKey !== undefined,
      },
    });
    return this.readBack(created);
  }

  /** Reemplaza el contenido de un borrador existente. */
  async update(id: string, input: SaveInvoiceDraft, userId: string): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true, aiExtractionJson: true },
    });
    if (!existing) throw new NotFoundException('Esa factura no existe.');
    if (existing.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        `Esta factura ya está ${INVOICE_STATUS_LABELS[existing.status]}: solo se pueden editar los borradores.`,
      );
    }
    await this.invoices.assertPayloadConfirmable(input);

    // Los avisos de la IA no viajan en cada guardado: se conservan los que ya
    // tenía el borrador, para no perderlos al reanudarlo por segunda vez.
    const extraction = buildDraftExtraction(input, previousWarnings(existing.aiExtractionJson));

    await this.prisma.$transaction(async (tx) => {
      // Claim condicionado: si alguien confirmó el borrador mientras esta
      // pantalla estaba abierta, este guardado NO puede pisar una factura ya
      // asentada en el inventario.
      const claim = await tx.invoice.updateMany({
        where: { id, status: 'PENDING_REVIEW' },
        data: {
          invoiceNumber: input.invoiceNumber ?? null,
          total: input.total,
          iva: input.iva ?? null,
          freightAmount: input.freight ?? 0,
          notes: input.notes ?? null,
          aiExtractionJson: extraction as unknown as Prisma.InputJsonValue,
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException(
          'Esta factura dejó de ser un borrador mientras la editabas. Vuelve a abrirla.',
        );
      }
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.createMany({ data: itemRows(id, input) });
    });

    await this.audit.log({
      userId,
      action: 'INVOICE_DRAFT_UPDATED',
      entityType: 'invoice',
      entityId: id,
      metadata: { itemsCount: input.items.length, total: input.total },
    });
    return this.readBack(id);
  }

  private assertPhotoPairing(input: SaveInvoiceDraft): void {
    const hasKey = input.photoStorageKey !== undefined;
    const hasModel = input.aiModelUsed !== undefined;
    if (hasKey !== hasModel) {
      throw new BadRequestException('Datos de la foto incompletos. Vuelve a subirla.');
    }
  }

  private async readBack(id: string): Promise<Invoice> {
    const row = await this.prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: includeFull(),
    });
    return toInvoiceDto(row);
  }
}

/** Filas de `invoice_items` a partir del payload revisado. */
function itemRows(invoiceId: string, input: SaveInvoiceDraft): Prisma.InvoiceItemCreateManyInput[] {
  return input.items.map((it, idx) => ({
    invoiceId,
    entityType: it.entityType,
    ingredientId: it.entityType === 'INGREDIENT' ? (it.ingredientId as string) : null,
    productId: it.entityType === 'PRODUCT' ? (it.productId as string) : null,
    descriptionRaw: it.descriptionRaw,
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.unitPrice,
    total: it.total,
    sortOrder: idx,
  }));
}

/**
 * El estado del borrador tal como lo va a leer el modal al reanudarlo.
 *
 * En una factura sin guardar, `aiExtractionJson` es lo que leyó la IA. En un
 * borrador pasa a ser lo REVISADO por la persona, porque el modal inicializa
 * sus campos desde ahí: si se dejara la extracción original, reanudar
 * mostraría los números viejos y el guardado no habría servido de nada.
 *
 * Incluye `baseFactor` por línea —la conversión a unidad de inventario— que no
 * tiene columna propia y sin la cual confirmar más tarde podría meter una
 * cantidad de mercancía distinta a la que se revisó.
 */
function buildDraftExtraction(input: SaveInvoiceDraft, warnings?: string[]): ExtractedInvoice {
  return {
    supplierName: input.supplierName,
    supplierNit: input.supplierNit,
    invoiceNumber: input.invoiceNumber ?? null,
    total: input.total,
    iva: input.iva ?? null,
    freight: input.freight ?? null,
    items: input.items.map((it) => ({
      descriptionRaw: it.descriptionRaw,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      total: it.total,
      packUnits: null,
      packSizePerUnit: null,
      packSizeMeasure: null,
      baseFactor: it.baseFactor ?? null,
    })),
    warnings: warnings ?? input.warnings ?? [],
  };
}

/** Avisos de la IA guardados en el borrador (si los tenía). */
function previousWarnings(stored: Prisma.JsonValue | null): string[] | undefined {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return undefined;
  const raw = (stored as Record<string, unknown>).warnings;
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((w): w is string => typeof w === 'string');
}
