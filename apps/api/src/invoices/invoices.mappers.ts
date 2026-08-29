import type { Invoice, InvoiceItem } from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';

/**
 * Mappers compartidos del dominio de facturas: el `include` canónico y la
 * proyección a DTO. Viven aparte para que `InvoicesService` y
 * `InvoicePaymentsService` los compartan sin duplicar (mismo patrón que
 * `sales.mappers.ts`).
 */

export type DbInvoiceWithDetail = Prisma.InvoiceGetPayload<{
  include: {
    supplier: { select: { name: true } };
    uploadedBy: { select: { fullName: true } };
    confirmedBy: { select: { fullName: true } };
    paymentActor: { select: { fullName: true } };
    voidedBy: { select: { fullName: true } };
    items: {
      include: {
        ingredient: { select: { name: true } };
        product: { select: { name: true } };
      };
    };
  };
}>;

export function includeFull() {
  return {
    supplier: { select: { name: true } },
    uploadedBy: { select: { fullName: true } },
    confirmedBy: { select: { fullName: true } },
    paymentActor: { select: { fullName: true } },
    voidedBy: { select: { fullName: true } },
    items: {
      include: {
        ingredient: { select: { name: true } },
        product: { select: { name: true } },
      },
      orderBy: { sortOrder: 'asc' },
    },
  } satisfies Prisma.InvoiceInclude;
}

export function toInvoiceDto(row: DbInvoiceWithDetail): Invoice {
  const items: InvoiceItem[] = row.items.map((it) => ({
    id: it.id,
    invoiceId: it.invoiceId,
    // Las facturas solo refieren INGREDIENT o PRODUCT (subproductos no se
    // compran, se producen). El cast narrowing aquí es seguro porque la app
    // nunca crea invoice_items con entityType='SUBPRODUCT'.
    entityType: it.entityType as 'INGREDIENT' | 'PRODUCT' | null,
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
  const paymentStatus = row.paymentStatus as 'PENDING' | 'PAID' | null;
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    invoiceNumber: row.invoiceNumber,
    total: row.total !== null ? Number(row.total) : null,
    iva: row.iva !== null ? Number(row.iva) : null,
    freightAmount: Number(row.freightAmount),
    photoStorageKey: row.photoStorageKey,
    aiModelUsed: row.aiModelUsed,
    status: row.status,
    uploadedById: row.uploadedById,
    uploadedByName: row.uploadedBy?.fullName ?? null,
    confirmedById: row.confirmedById,
    confirmedByName: row.confirmedBy?.fullName ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    notes: row.notes,
    paymentStatus,
    paidAt: row.paidAt?.toISOString() ?? null,
    hasPaymentProof: row.paymentProofKey !== null,
    paymentActorId: row.paymentActorId,
    paymentActorName: row.paymentActor?.fullName ?? null,
    paymentNote: row.paymentNote,
    // El reparto por bolsillo solo tiene sentido pagada (la columna tiene
    // default 'CUENTA' aunque no haya pago — sin filtrar mostraría
    // "Cuenta · $0" en facturas por pagar).
    paymentPocket:
      paymentStatus === 'PAID'
        ? (row.paymentPocket as 'EFECTIVO' | 'CUENTA' | 'MIXTO')
        : null,
    paymentCashAmount: paymentStatus === 'PAID' ? Number(row.paymentCashAmount) : null,
    paymentBankAmount: paymentStatus === 'PAID' ? Number(row.paymentBankAmount) : null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedByName: row.voidedBy?.fullName ?? null,
    voidReason: row.voidReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items,
  };
}
