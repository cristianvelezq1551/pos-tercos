import { BadRequestException, Injectable } from '@nestjs/common';
import type { Sale, SyncOfflineSale } from '@pos-tercos/types';
import type { PaymentMethod, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftsService } from '../shifts/shifts.service';
import { SalesConsumptionService } from './sales-consumption.service';
import { includeFull, toSaleDto } from './sales.mappers';

/**
 * Sincronización de ventas cobradas OFFLINE (Fase B.3). Separado de
 * SalesService: el flujo no comparte estado con el cobro online, solo la
 * lógica de consumo (SalesConsumptionService).
 */
@Injectable()
export class SalesOfflineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly shifts: ShiftsService,
    private readonly consumption: SalesConsumptionService,
  ) {}

  /**
   * Registra una venta cobrada OFFLINE (COUNTER) que el POS sincroniza al
   * recuperar conexión. La graba TAL CUAL se cobró:
   *  - Totales VERBATIM (no recomputa promos ni valida soldOut → "gana lo
   *    cobrado offline"; cualquier diferencia se ve en el stock/auditoría).
   *  - `paidAt = soldOfflineAt` (backdateado → el revenue cae en la hora real).
   *  - Status ENTREGADO: la venta ya fue entrega directa offline (NO entra al
   *    KDS ni al turnero, ni dispara notificaciones).
   *  - Idempotente por `localId` (= idempotency key) → cero doble-cobro.
   */
  async syncOffline(input: SyncOfflineSale, userId: string): Promise<Sale> {
    const dup = await this.prisma.sale.findUnique({
      where: { idempotencyKey: input.localId },
      include: includeFull(),
    });
    if (dup) {
      await this.audit.log({
        userId,
        action: 'IDEMPOTENCY_HIT',
        entityType: 'sale',
        entityId: dup.id,
        metadata: { endpoint: 'POST /sales/sync-offline', key: input.localId },
      });
      return toSaleDto(dup);
    }

    // Caja del día abierta (la que estaba abierta antes del corte). Si quedó una
    // de un día previo, getActiveTodayShift lanza Conflict → falla → el cajero
    // cierra la caja vieja y reintenta (bandeja de revisión, B.5).
    const shift = await this.shifts.getActiveTodayShift(userId);
    if (!shift) {
      throw new BadRequestException(
        'No hay caja abierta para asociar la venta offline. Abrí/cerrá caja y reintentá.',
      );
    }

    // Validar productos + computar consumo ANTES de la tx: un fallo acá manda la
    // venta a la bandeja de revisión sin quemar número de recibo.
    const specs = await this.consumption.computeConsumptionSpecs(
      input.payload.lines,
      'Offline venta',
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const [{ next }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT nextval('receipt_seq') AS next
      `;
      const receiptNumber = next;
      // Turno: secuencia por caja (igual que confirmPayment).
      const assigned = await tx.sale.count({
        where: { shiftId: shift.id, turnNumber: { not: null } },
      });
      const turnNumber = assigned + 1;

      const sale = await tx.sale.create({
        data: {
          receiptNumber,
          type: 'COUNTER',
          status: 'ENTREGADO',
          turnNumber,
          customerName: input.payload.customerName,
          subtotal: input.payload.subtotal,
          discountTotal: input.payload.discount,
          total: input.payload.total,
          paymentMethod: input.payment.method as PaymentMethod,
          paidAt: new Date(input.soldOfflineAt),
          paidByUserId: userId,
          cashierId: userId,
          shiftId: shift.id,
          idempotencyKey: input.localId,
          items: {
            create: input.payload.lines.map((l) => ({
              productId: l.productId,
              sizeId: l.sizeId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              modifiersJson: l.modifiers as unknown as Prisma.InputJsonValue,
              notes: l.notes ?? null,
              appliedPromotionId: l.appliedPromotionId,
              lineSubtotal: l.lineSubtotal,
              lineDiscount: l.lineDiscount,
              lineTotal: l.lineTotal,
            })),
          },
          statusLog: {
            create: {
              statusFrom: null,
              statusTo: 'ENTREGADO',
              userId,
              notes: `Venta offline ${input.provisionalNumber} sincronizada`,
            },
          },
          // Fuente única de verdad del método: el cobro offline es 1 parte.
          payments: {
            create: {
              method: input.payment.method as PaymentMethod,
              amount: input.payload.total,
              amountReceived:
                input.payment.method === 'CASH' ? input.payment.amountReceived : null,
            },
          },
        },
        select: { id: true },
      });

      if (specs.length > 0) {
        await tx.inventoryMovement.createMany({
          data: specs.map((s) => ({
            entityType: s.entityType,
            ingredientId: s.ingredientId ?? null,
            productId: s.productId ?? null,
            subproductId: s.subproductId ?? null,
            delta: s.delta,
            type: 'SALE' as const,
            sourceType: 'sale',
            sourceId: sale.id,
            userId,
            notes: s.note,
          })),
        });
      }

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: includeFull(),
      });
    });

    const dto = toSaleDto(updated);
    await this.audit.log({
      userId,
      action: 'SALE_SYNCED_OFFLINE',
      entityType: 'sale',
      entityId: dto.id,
      metadata: {
        provisionalNumber: input.provisionalNumber,
        receiptNumber: dto.receiptNumber,
        turnNumber: dto.turnNumber,
        method: input.payment.method,
        offlineVerified: input.payment.offlineVerified,
        soldOfflineAt: input.soldOfflineAt,
        movementsCreated: specs.length,
      },
    });
    // Sin KDS ni notificaciones: la venta offline ya se entregó (entrega directa).
    return dto;
  }
}
