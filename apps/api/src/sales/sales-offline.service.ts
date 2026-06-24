import { BadRequestException, Injectable } from '@nestjs/common';
import type { Sale, SyncOfflineSale } from '@pos-tercos/types';
import type { PaymentMethod, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftsService } from '../shifts/shifts.service';
import { SalesConsumptionService, type ConsumptionSpec } from './sales-consumption.service';
import { runSaleTxWithRetry, SALE_TX_OPTS } from './sales.service';
import { includeFull, toSaleDto } from './sales.mappers';

/**
 * Una venta offline solo puede haber ocurrido en el PASADO. Si el reloj del
 * POS está adelantado, el revenue caería "en el futuro" y rompería reportes
 * y cierre de caja → se rechaza (la venta queda en la bandeja de revisión
 * hasta que corrijan la hora del dispositivo).
 */
const MAX_FUTURE_CLOCK_DRIFT_MS = 15 * 60 * 1000;

/** Drift de precio tolerado antes de marcar en bitácora (1% por línea). */
const PRICE_DRIFT_TOLERANCE = 0.01;

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

    // Reloj del POS adelantado → paidAt en el futuro → reportes y caja rotos.
    // Pasado lejano es legítimo (corte largo de internet); futuro no existe.
    const soldAt = new Date(input.soldOfflineAt).getTime();
    const driftMs = soldAt - Date.now();
    if (driftMs > MAX_FUTURE_CLOCK_DRIFT_MS) {
      await this.audit.log({
        userId,
        action: 'OFFLINE_SYNC_CLOCK_DRIFT',
        entityType: 'sale',
        metadata: {
          provisionalNumber: input.provisionalNumber,
          soldOfflineAt: input.soldOfflineAt,
          driftMinutes: Math.round(driftMs / 60_000),
        },
      });
      throw new BadRequestException(
        `El reloj del POS está adelantado ${Math.round(driftMs / 60_000)} min respecto al servidor. Corregí la hora del dispositivo y reintentá desde la bandeja.`,
      );
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

    const updated = await runSaleTxWithRetry(() =>
     this.prisma.$transaction(async (tx) => {
      const [{ next }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT nextval('receipt_seq') AS next
      `;
      const receiptNumber = next;
      // Turno: secuencia por caja (igual que confirmPayment). El índice único
      // (shift_id, turn_number) + runSaleTxWithRetry evitan que un sync offline
      // y un cobro online concurrentes asignen el mismo turno.
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
     }, SALE_TX_OPTS),
    );

    const dto = toSaleDto(updated);
    // "Gana lo cobrado offline" (decisión documentada), pero el drift de
    // precio contra el catálogo ACTUAL queda en bitácora: si la venta se
    // cobró con un snapshot viejo (o manipulado), el dueño lo ve.
    await this.auditPriceDrift(input, dto.id, userId);
    // El online bloquea stock negativo (assertStockSufficient). El offline NO
    // puede rechazar (la venta YA ocurrió → "gana lo cobrado offline"), pero el
    // stock negativo resultante queda en bitácora para que el dueño lo concilie.
    await this.auditNegativeStock(specs, dto.id, userId);
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

  /** Compara el unitPrice cobrado offline contra el catálogo vigente. */
  private async auditPriceDrift(
    input: SyncOfflineSale,
    saleId: string,
    userId: string,
  ): Promise<void> {
    try {
      const productIds = Array.from(new Set(input.payload.lines.map((l) => l.productId)));
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          basePrice: true,
          comboPrice: true,
          isCombo: true,
          sizes: { select: { id: true, priceModifier: true } },
        },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      const drifted: Array<{ product: string; charged: number; catalog: number }> = [];
      for (const line of input.payload.lines) {
        const product = byId.get(line.productId);
        if (!product) continue;
        let expected = Number(
          product.isCombo && product.comboPrice !== null ? product.comboPrice : product.basePrice,
        );
        if (line.sizeId) {
          const size = product.sizes.find((sz) => sz.id === line.sizeId);
          if (size) expected += Number(size.priceModifier);
        }
        for (const mod of line.modifiers ?? []) {
          expected += Number(mod.priceDelta ?? 0);
        }
        if (expected > 0 && Math.abs(line.unitPrice - expected) / expected > PRICE_DRIFT_TOLERANCE) {
          drifted.push({ product: product.name, charged: line.unitPrice, catalog: expected });
        }
      }
      if (drifted.length > 0) {
        await this.audit.log({
          userId,
          action: 'OFFLINE_PRICE_DRIFT_DETECTED',
          entityType: 'sale',
          entityId: saleId,
          metadata: { provisionalNumber: input.provisionalNumber, lines: drifted },
        });
      }
    } catch {
      // La auditoría de drift nunca bloquea el sync (la venta ya está grabada).
    }
  }

  /**
   * Tras grabar los movements offline, revisa si algún stockable quedó en
   * NEGATIVO (el online lo habría bloqueado con assertStockSufficient; el
   * offline no puede). No revierte nada — solo lo deja en bitácora para que el
   * dueño concilie la desincronización de stock.
   */
  private async auditNegativeStock(
    specs: ConsumptionSpec[],
    saleId: string,
    userId: string,
  ): Promise<void> {
    try {
      const entities = new Map<string, { entityType: string; id: string }>();
      for (const s of specs) {
        const id = s.ingredientId ?? s.productId ?? s.subproductId;
        if (id) entities.set(`${s.entityType}:${id}`, { entityType: s.entityType, id });
      }
      const negative: Array<{ entityType: string; entityId: string; stock: number }> = [];
      for (const e of entities.values()) {
        const where: Prisma.InventoryMovementWhereInput =
          e.entityType === 'INGREDIENT'
            ? { ingredientId: e.id }
            : e.entityType === 'PRODUCT'
              ? { productId: e.id }
              : { subproductId: e.id };
        const agg = await this.prisma.inventoryMovement.aggregate({
          where,
          _sum: { delta: true },
        });
        const stock = Number(agg._sum.delta ?? 0);
        if (stock < 0) negative.push({ entityType: e.entityType, entityId: e.id, stock });
      }
      if (negative.length > 0) {
        await this.audit.log({
          userId,
          action: 'OFFLINE_NEGATIVE_STOCK',
          entityType: 'sale',
          entityId: saleId,
          metadata: { count: negative.length, items: negative },
        });
      }
    } catch {
      // La auditoría nunca bloquea el sync (la venta ya está grabada).
    }
  }
}
