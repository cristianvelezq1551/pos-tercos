import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { roundMoney } from '@pos-tercos/domain';
import type {
  AppliedModifier,
  ChangeSalePayment,
  EditSaleItems,
  PaymentMethod,
  Sale,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { KdsGateway } from '../kds/kds.gateway';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { SalesConsumptionService } from './sales-consumption.service';
import {
  computeLine,
  runSaleTxWithRetry,
  SALE_TX_OPTS,
  type ComputedSaleItem,
} from './sales.service';
import { includeFull, toSaleDto } from './sales.mappers';

/** Estados donde el pedido sigue "vivo" en el local y se puede corregir. */
const EDITABLE_STATUSES = ['PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO'] as const;
/** El pago se puede reclasificar mientras la caja del turno siga abierta. */
const PAYMENT_CHANGE_STATUSES = [
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
] as const;

/**
 * Correcciones del mostrador sobre ventas YA COBRADAS:
 *  - editItems: cambiar productos del pedido respetando a la cocina (si ya
 *    lo inició, solo se tocan líneas de reventa directa, ej. bebidas).
 *  - changePayment: reclasificar el método/división del pago (la plata ya
 *    entró; esto corrige el registro para que el arqueo cuadre).
 * Separado de SalesService: no crea ventas ni transiciona estados de cocina.
 */
@Injectable()
export class SalesEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly promotions: PromotionsService,
    private readonly consumption: SalesConsumptionService,
    private readonly paymentMethods: PaymentMethodsService,
    @Inject(forwardRef(() => KdsGateway)) private readonly kdsGateway: KdsGateway,
  ) {}

  // ==================================================================
  // EDIT ITEMS
  // ==================================================================

  async editItems(saleId: string, input: EditSaleItems, userId: string): Promise<Sale> {
    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true, shift: { select: { status: true } } },
    });
    if (!existing) throw new NotFoundException(`Sale ${saleId} not found`);
    if (!EDITABLE_STATUSES.includes(existing.status as (typeof EDITABLE_STATUSES)[number])) {
      throw new BadRequestException(
        existing.status === 'ENTREGADO'
          ? 'El pedido ya fue entregado — no se puede editar.'
          : `No se puede editar un pedido en estado ${existing.status}.`,
      );
    }
    if (existing.shift && existing.shift.status !== 'OPEN') {
      throw new BadRequestException(
        'La caja del turno ya cerró — el pedido es histórico inmutable.',
      );
    }

    // Productos involucrados (viejos + nuevos) con su flag de reventa.
    const oldIds = existing.items.map((it) => it.productId);
    const newIds = input.items.map((it) => it.productId);
    const allIds = Array.from(new Set([...oldIds, ...newIds]));
    const now = new Date();
    const [products, activePromotions] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: allIds } },
        include: { sizes: true, modifiers: true },
      }),
      this.promotions.loadActiveAt(now),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Regla de cocina: si el pedido YA se inició (≠ PAGADO), las líneas de
    // PREPARACIÓN deben quedar idénticas — solo cambia la reventa directa.
    if (existing.status !== 'PAGADO') {
      const oldPrepared = this.preparedFingerprint(
        existing.items.map((it) => ({
          productId: it.productId,
          sizeId: it.sizeId,
          quantity: it.quantity,
          modifierIds: ((it.modifiersJson as unknown as AppliedModifier[]) ?? []).map(
            (m) => m.modifierId,
          ),
          notes: it.notes,
        })),
        productMap,
      );
      const newPrepared = this.preparedFingerprint(
        input.items.map((it) => ({
          productId: it.productId,
          sizeId: it.sizeId ?? null,
          quantity: it.quantity,
          modifierIds: (it.modifiers ?? []).map((m) => m.modifierId),
          notes: it.notes ?? null,
        })),
        productMap,
      );
      if (!mapsEqual(oldPrepared, newPrepared)) {
        throw new BadRequestException(
          'La cocina ya inició este pedido: las comidas de preparación no se pueden cambiar (solo productos de reventa, ej. bebidas).',
        );
      }
    }

    // Recalcular líneas con el mismo motor del create (precios + promos).
    const computedItems: ComputedSaleItem[] = input.items.map((it) =>
      computeLine(it, productMap, activePromotions, now),
    );
    const subtotal = roundMoney(computedItems.reduce((a, it) => a + it.lineSubtotal, 0));
    const discountTotal = roundMoney(computedItems.reduce((a, it) => a + it.lineDiscount, 0));
    const total = roundMoney(subtotal - discountTotal);
    const oldTotal = Number(existing.total);

    // Cuenta dividida + total distinto: no hay forma única de repartir la
    // diferencia entre las partes → se corrige el pago aparte (changePayment).
    if (existing.payments.length > 1 && Math.abs(total - oldTotal) > 0.005) {
      throw new BadRequestException(
        'La cuenta está dividida y el total cambiaría. Ajustá los pagos con "Cambiar pago" después de igualar el total, o anulá y recobrá.',
      );
    }

    // Stock: movements por la DIFERENCIA de consumo (viejo vs nuevo). El
    // consumo ya descontado al cobrar queda intacto; acá solo se ajusta.
    const [oldSpecs, newSpecs] = await Promise.all([
      this.consumption.computeConsumptionSpecs(
        existing.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          sizeId: it.sizeId,
          modifiers: ((it.modifiersJson as unknown as AppliedModifier[]) ?? []).map((m) => ({
            modifierId: m.modifierId,
          })),
        })),
        `Sale ${saleId.slice(0, 8)}`,
      ),
      this.consumption.computeConsumptionSpecs(
        input.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          sizeId: it.sizeId ?? null,
          modifiers: it.modifiers,
        })),
        `Sale ${saleId.slice(0, 8)}`,
      ),
    ]);
    const deltaMovements = this.consumptionDelta(oldSpecs, newSpecs, saleId, userId);

    const updated = await runSaleTxWithRetry(() =>
     this.prisma.$transaction(async (tx) => {
      const res = await tx.sale.updateMany({
        // Guard TOCTOU: si la cocina avanzó el estado entre la lectura y acá,
        // abortamos (la regla de líneas bloqueadas podría haber cambiado).
        where: { id: saleId, status: existing.status },
        data: { subtotal, discountTotal, total },
      });
      if (res.count === 0) {
        throw new BadRequestException('El pedido cambió de estado — recargá e intentá de nuevo.');
      }
      await tx.saleItem.deleteMany({ where: { saleId } });
      await tx.saleItem.createMany({
        data: computedItems.map((c) => ({
          saleId,
          productId: c.productId,
          sizeId: c.sizeId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          modifiersJson: c.modifiers as unknown as Prisma.InputJsonValue,
          notes: c.notes,
          appliedPromotionId: c.appliedPromotionId,
          lineSubtotal: c.lineSubtotal,
          lineDiscount: c.lineDiscount,
          lineTotal: c.lineTotal,
        })),
      });

      // Pago único: la parte se ajusta al nuevo total (el cajero cobra o
      // devuelve la diferencia en el momento).
      if (Math.abs(total - oldTotal) > 0.005 && existing.payments.length === 1) {
        const pay = existing.payments[0]!;
        const received =
          pay.amountReceived !== null ? Math.max(Number(pay.amountReceived), total) : null;
        await tx.salePayment.update({
          where: { id: pay.id },
          data: { amount: total, amountReceived: received },
        });
      }

      if (deltaMovements.length > 0) {
        await this.consumption.assertStockSufficient(tx, deltaMovements);
        await tx.inventoryMovement.createMany({ data: deltaMovements });
      }

      await tx.saleStatusLog.create({
        data: {
          saleId,
          statusFrom: existing.status,
          statusTo: existing.status,
          userId,
          notes: `Pedido editado (${computedItems.length} líneas, total ${oldTotal} → ${total})`,
        },
      });

      return tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: includeFull() });
     }, SALE_TX_OPTS),
    );

    await this.audit.log({
      userId,
      action: 'SALE_ITEMS_EDITED',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        status: existing.status,
        totalBefore: oldTotal,
        totalAfter: total,
        itemsBefore: existing.items.map((it) => `${it.quantity}x ${it.productId}`),
        itemsAfter: computedItems.map((c) => `${c.quantity}x ${c.productId}`),
        stockDeltaMovements: deltaMovements.length,
      },
    });

    const dto = toSaleDto(updated);
    // La cocina ve el pedido actualizado al instante (mismo evento que usa
    // el board para refrescar una card existente).
    this.kdsGateway.emit('order.status.changed', dto);
    return dto;
  }

  // ==================================================================
  // CHANGE PAYMENT
  // ==================================================================

  async changePayment(
    saleId: string,
    input: ChangeSalePayment,
    userId: string,
  ): Promise<Sale> {
    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { payments: true, shift: { select: { status: true } } },
    });
    if (!existing) throw new NotFoundException(`Sale ${saleId} not found`);
    if (
      !PAYMENT_CHANGE_STATUSES.includes(
        existing.status as (typeof PAYMENT_CHANGE_STATUSES)[number],
      )
    ) {
      throw new BadRequestException(
        `No se puede cambiar el pago de una venta en estado ${existing.status}.`,
      );
    }
    if (existing.shift && existing.shift.status !== 'OPEN') {
      throw new BadRequestException(
        'La caja del turno ya cerró — el pago es histórico inmutable.',
      );
    }

    const total = Number(existing.total);
    const parts =
      input.payments ?? [{ method: input.method! as PaymentMethod, amount: total }];

    const enabled = await this.paymentMethods.enabledSet();
    const disabled = parts.find((p) => !enabled.has(p.method));
    if (disabled) {
      throw new BadRequestException(
        `El medio de pago ${disabled.method} no está habilitado.`,
      );
    }
    const sum = parts.reduce((a, p) => a + p.amount, 0);
    if (Math.abs(sum - total) > 0.005) {
      throw new BadRequestException(
        `Las partes suman ${roundMoney(sum)} pero el total es ${total}.`,
      );
    }

    const before = existing.payments.map((p) => ({
      method: p.method,
      amount: Number(p.amount),
    }));
    const summaryMethod: PaymentMethod | null =
      parts.length === 1 ? (parts[0]!.method as PaymentMethod) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.salePayment.deleteMany({ where: { saleId } });
      await tx.salePayment.createMany({
        data: parts.map((p) => ({
          saleId,
          method: p.method as PaymentMethod,
          amount: p.amount,
          amountReceived: p.method === 'CASH' ? p.amount : null,
        })),
      });
      await tx.sale.update({
        where: { id: saleId },
        data: { paymentMethod: summaryMethod },
      });
      await tx.saleStatusLog.create({
        data: {
          saleId,
          statusFrom: existing.status,
          statusTo: existing.status,
          userId,
          notes: `Pago re-registrado: ${before.map((b) => b.method).join('+')} → ${parts.map((p) => p.method).join('+')}`,
        },
      });
      return tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: includeFull() });
    });

    await this.audit.log({
      userId,
      action: 'SALE_PAYMENT_CHANGED',
      entityType: 'sale',
      entityId: saleId,
      metadata: {
        before,
        after: parts.map((p) => ({ method: p.method, amount: p.amount })),
        total,
      },
    });

    return toSaleDto(updated);
  }

  // ==================================================================
  // HELPERS
  // ==================================================================

  /**
   * Huella de las líneas de PREPARACIÓN (no reventa): clave normalizada →
   * cantidad total. Dos pedidos con la misma huella tienen exactamente las
   * mismas comidas para cocina (producto, tamaño, modificadores y notas).
   */
  private preparedFingerprint(
    lines: Array<{
      productId: string;
      sizeId: string | null;
      quantity: number;
      modifierIds: string[];
      notes: string | null;
    }>,
    productMap: Map<string, { directResale: boolean }>,
  ): Map<string, number> {
    const out = new Map<string, number>();
    for (const line of lines) {
      const product = productMap.get(line.productId);
      if (!product) throw new NotFoundException(`Product ${line.productId} not found`);
      if (product.directResale) continue; // reventa: editable siempre
      const key = [
        line.productId,
        line.sizeId ?? '',
        [...line.modifierIds].sort().join(','),
        (line.notes ?? '').trim(),
      ].join('|');
      out.set(key, (out.get(key) ?? 0) + line.quantity);
    }
    return out;
  }

  /** Movements netos por entidad: consumo nuevo − consumo viejo. */
  private consumptionDelta(
    oldSpecs: ReadonlyArray<{
      entityType: string;
      ingredientId?: string;
      productId?: string;
      subproductId?: string;
      delta: number;
    }>,
    newSpecs: ReadonlyArray<{
      entityType: string;
      ingredientId?: string;
      productId?: string;
      subproductId?: string;
      delta: number;
    }>,
    saleId: string,
    userId: string,
  ): Prisma.InventoryMovementCreateManyInput[] {
    type Key = string;
    const net = new Map<Key, { spec: (typeof oldSpecs)[number]; delta: number }>();
    const keyOf = (s: (typeof oldSpecs)[number]): Key =>
      `${s.entityType}|${s.ingredientId ?? ''}|${s.productId ?? ''}|${s.subproductId ?? ''}`;
    for (const s of newSpecs) {
      const k = keyOf(s);
      const cur = net.get(k) ?? { spec: s, delta: 0 };
      cur.delta += s.delta;
      net.set(k, cur);
    }
    for (const s of oldSpecs) {
      const k = keyOf(s);
      const cur = net.get(k) ?? { spec: s, delta: 0 };
      cur.delta -= s.delta; // restar el consumo viejo (que era negativo)
      net.set(k, cur);
    }
    const out: Prisma.InventoryMovementCreateManyInput[] = [];
    for (const { spec, delta } of net.values()) {
      const rounded = Math.round(delta * 10_000) / 10_000;
      if (rounded === 0) continue;
      out.push({
        entityType: spec.entityType as 'INGREDIENT' | 'PRODUCT' | 'SUBPRODUCT',
        ingredientId: spec.ingredientId ?? null,
        productId: spec.productId ?? null,
        subproductId: spec.subproductId ?? null,
        delta: rounded,
        type: 'SALE',
        sourceType: 'sale',
        sourceId: saleId,
        userId,
        notes: 'Ajuste por edición de pedido',
      });
    }
    return out;
  }
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}
