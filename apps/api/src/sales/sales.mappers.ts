import type { ReceiptData } from '@pos-tercos/domain';
import type { AppliedModifier, Sale, SaleItem } from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';

/**
 * Mappers y shapes compartidos entre los servicios de ventas
 * (SalesService, SalesOfflineService, SalesReceiptService).
 */

export type DbSaleWithDetail = Prisma.SaleGetPayload<{
  include: {
    cashier: { select: { fullName: true } };
    paidBy: { select: { fullName: true } };
    items: {
      include: {
        product: { select: { name: true } };
        size: { select: { name: true } };
        appliedPromotion: { select: { name: true } };
      };
    };
  };
}>;

export function includeFull() {
  return {
    cashier: { select: { fullName: true } },
    paidBy: { select: { fullName: true } },
    items: {
      include: {
        product: { select: { name: true } },
        size: { select: { name: true } },
        appliedPromotion: { select: { name: true } },
      },
    },
  } satisfies Prisma.SaleInclude;
}

/**
 * Convierte un Sale DTO + flag de reimpresión al formato `ReceiptData`
 * que consume el renderer puro. Branding del negocio viene de env vars
 * con fallbacks razonables para dev.
 */
export function buildReceiptData(sale: Sale, isReprint: boolean): ReceiptData {
  return {
    receiptNumber: sale.receiptNumber,
    turnNumber: sale.turnNumber,
    createdAt: sale.createdAt,
    cashierName: sale.cashierName ?? null,
    customerName: sale.customerName,
    items: (sale.items ?? []).map((it) => ({
      productName: it.productName ?? '(sin nombre)',
      sizeName: it.sizeName ?? null,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineSubtotal: it.lineSubtotal,
      lineDiscount: it.lineDiscount,
      lineTotal: it.lineTotal,
      appliedPromotionName: it.appliedPromotionName ?? null,
      modifiers: (it.modifiers ?? []).map((m) => ({
        name: m.name,
        priceDelta: m.priceDelta,
      })),
    })),
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    total: sale.total,
    reprintLabel: isReprint ? 'DUPLICADO' : null,
    // En efectivo el print abre el cajón (RJ-11). En transferencia no hace falta.
    openDrawer: sale.paymentMethod === 'CASH',
    business: {
      name: process.env.BUSINESS_NAME ?? 'POS Tercos',
      address: process.env.BUSINESS_ADDRESS ?? 'Dirección por configurar',
      nit: process.env.BUSINESS_NIT ?? '900.000.000-0',
      phone: process.env.BUSINESS_PHONE ?? null,
    },
  };
}

export function toSaleDto(row: DbSaleWithDetail): Sale {
  const items: SaleItem[] = row.items.map((it) => ({
    id: it.id,
    saleId: it.saleId,
    productId: it.productId,
    productName: it.product?.name ?? undefined,
    sizeId: it.sizeId,
    sizeName: it.size?.name ?? null,
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice),
    modifiers: (it.modifiersJson as unknown as AppliedModifier[]) ?? [],
    notes: it.notes ?? null,
    appliedPromotionId: it.appliedPromotionId,
    appliedPromotionName: it.appliedPromotion?.name ?? null,
    lineSubtotal: Number(it.lineSubtotal),
    lineDiscount: Number(it.lineDiscount),
    lineTotal: Number(it.lineTotal),
  }));
  return {
    id: row.id,
    receiptNumber: Number(row.receiptNumber),
    type: row.type,
    status: row.status,
    turnNumber: row.turnNumber,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerNit: row.customerNit,
    subtotal: Number(row.subtotal),
    discountTotal: Number(row.discountTotal),
    total: Number(row.total),
    paymentMethod: row.paymentMethod,
    paidAt: row.paidAt?.toISOString() ?? null,
    paidByUserId: row.paidByUserId,
    paidByName: row.paidBy?.fullName ?? null,
    cashierId: row.cashierId,
    cashierName: row.cashier?.fullName ?? null,
    shiftId: row.shiftId,
    notes: row.notes,
    voidReason: row.voidReason,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    items,
  };
}
