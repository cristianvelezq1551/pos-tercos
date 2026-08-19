import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { manualDiscountAmount, roundMoney, type ManualDiscountSpec } from '@pos-tercos/domain';
import { isWebSaleType } from '@pos-tercos/types';
import type {
  AppliedModifier,
  ChangeSalePayment,
  EditSaleItems,
  ManualDiscountKind,
  PaymentMethod,
  Sale,
} from '@pos-tercos/types';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';
import { SalesConsumptionService } from './sales-consumption.service';
import {
  computeLine,
  SALE_TX_OPTS,
  type ComputedSaleItem,
} from './sales.service';
import { runWithSerializationRetry } from '../common/tx';
import { includeFull, toSaleDto } from './sales.mappers';

/** Estados donde el pedido sigue "vivo" en el local y se puede corregir. */
const EDITABLE_STATUSES = [
  'PENDIENTE_PAGO',
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
] as const;
/** La cocina ya tiene el pedido: las líneas de preparación quedan congeladas. */
const KITCHEN_STARTED_STATUSES = ['EN_PREPARACION', 'LISTO_DESPACHO'] as const;
/** Estados donde el stock YA se descontó (editar ajusta por la diferencia). */
const STOCK_DEDUCTED_STATUSES = ['PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO'] as const;
/** El pago se puede reclasificar mientras la caja del turno siga abierta. */
const PAYMENT_CHANGE_STATUSES = [
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
] as const;

/**
 * Correcciones del mostrador sobre ventas YA COBRADAS (y cuentas abiertas):
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
  ) {}

  // ==================================================================
  // EDIT ITEMS
  // ==================================================================

  async editItems(saleId: string, input: EditSaleItems, userId: string): Promise<Sale> {
    const now = new Date();
    let auditMeta: Record<string, unknown> = {};

    // B2 (auditoría): TODAS las lecturas de la venta van DENTRO de la tx y del
    // retry de serialización. Un reintento recomputa los deltas de stock contra
    // los items FRESCOS — antes se computaban afuera y el retry re-aplicaba
    // deltas stale (doble ajuste permanente en el ledger).
    const updated = await runWithSerializationRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.sale.findUnique({
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
        // Cuenta abierta sin pagar: VIVE entre cajas a propósito (se puede
        // seguir agregando aunque la caja que la creó haya cerrado — al cobrar
        // se re-cuelga a la caja abierta). Las ventas YA COBRADAS sí quedan
        // congeladas al cerrar su caja (histórico inmutable del arqueo).
        const isLiveOpenTab = existing.isOpenTab && existing.status === 'PENDIENTE_PAGO';
        if (!isLiveOpenTab && existing.shift && existing.shift.status !== 'OPEN') {
          throw new BadRequestException(
            'La caja del turno ya cerró — el pedido es histórico inmutable.',
          );
        }

        // Descuento manual (#5b): presente = setear, null = quitar, ausente =
        // conservar el de la venta. Cualquier descuento manual desactiva promos.
        const orderDiscountSpec: ManualDiscountSpec | null =
          input.orderDiscount === undefined
            ? existing.orderDiscountKind !== null && existing.orderDiscountValue !== null
              ? {
                  kind: existing.orderDiscountKind as ManualDiscountKind,
                  value: Number(existing.orderDiscountValue),
                }
              : null
            : input.orderDiscount;
        const hasManualDiscount =
          orderDiscountSpec !== null ||
          input.items.some((it) => it.manualDiscount !== undefined);
        const discountReason = input.discountReason ?? existing.discountReason ?? null;
        if (hasManualDiscount && !discountReason) {
          throw new BadRequestException('El descuento manual requiere un motivo.');
        }

        // Productos involucrados (viejos + nuevos) con su flag de reventa.
        const oldIds = existing.items.map((it) => it.productId);
        const newIds = input.items.map((it) => it.productId);
        const allIds = Array.from(new Set([...oldIds, ...newIds]));
        const [products, activePromotions] = await Promise.all([
          this.prisma.product.findMany({
            where: { id: { in: allIds } },
            include: { sizes: true, modifiers: true },
          }),
          hasManualDiscount
            ? Promise.resolve([])
            : this.promotions.loadActiveAt(
                now,
                isWebSaleType(existing.type) ? 'WEB' : 'POS',
              ),
        ]);
        const productMap = new Map(products.map((p) => [p.id, p]));

        // Regla de cocina: si la cocina YA inició el pedido, las líneas de
        // PREPARACIÓN deben quedar idénticas — solo cambia la reventa directa.
        // PENDIENTE_PAGO (incl. cuentas abiertas) y PAGADO se editan libremente.
        if (
          KITCHEN_STARTED_STATUSES.includes(
            existing.status as (typeof KITCHEN_STARTED_STATUSES)[number],
          )
        ) {
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

        // Recalcular líneas con el mismo motor del create (precios + promos o
        // descuento manual — excluyentes).
        const computedItems: ComputedSaleItem[] = input.items.map((it) =>
          computeLine(it, productMap, activePromotions, now),
        );
        const subtotal = roundMoney(computedItems.reduce((a, it) => a + it.lineSubtotal, 0));
        const lineDiscountTotal = roundMoney(
          computedItems.reduce((a, it) => a + it.lineDiscount, 0),
        );
        const orderDiscountAmount = orderDiscountSpec
          ? manualDiscountAmount(roundMoney(subtotal - lineDiscountTotal), orderDiscountSpec)
          : 0;
        const discountTotal = roundMoney(lineDiscountTotal + orderDiscountAmount);
        // El envío (WEB_DELIVERY) es parte del total y NO se recalcula al editar
        // ítems: entra tal cual al breakdown (CHECK sales_total_matches_breakdown =
        // subtotal − descuento + envío). Omitirlo violaba el CHECK → 500 en cada
        // edición de un domicilio con envío asignado.
        const deliveryFee = Number(existing.deliveryFee);
        const total = roundMoney(subtotal - discountTotal + deliveryFee);
        const oldTotal = Number(existing.total);

        // Cuenta dividida + total distinto: no hay forma única de repartir la
        // diferencia entre las partes → se corrige el pago aparte (changePayment).
        if (existing.payments.length > 1 && Math.abs(total - oldTotal) > 0.005) {
          throw new BadRequestException(
            'La cuenta está dividida y el total cambiaría. Ajusta los pagos con "Cambiar pago" después de igualar el total, o anula y vuelve a cobrar.',
          );
        }

        // Stock: movements por la DIFERENCIA de consumo (viejo vs nuevo). El
        // consumo ya descontado al cobrar queda intacto; acá solo se ajusta.
        // PENDIENTE_PAGO aún NO descontó stock → no se generan movements.
        const stockWasDeducted = STOCK_DEDUCTED_STATUSES.includes(
          existing.status as (typeof STOCK_DEDUCTED_STATUSES)[number],
        );
        let deltaMovements: Prisma.InventoryMovementCreateManyInput[] = [];
        // Faltantes tolerados al ajustar (mismo criterio que el cobro):
        // productos forzados disponibles + consumibles.
        let tolerateStockKeys = new Set<string>();
        if (stockWasDeducted) {
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
          deltaMovements = this.consumptionDelta(oldSpecs, newSpecs, saleId, userId);
          const lineProductIds = Array.from(new Set(input.items.map((it) => it.productId)));
          const forced = await this.prisma.product.findMany({
            where: { id: { in: lineProductIds }, forceAvailable: true },
            select: { id: true },
          });
          tolerateStockKeys = this.consumption.tolerableKeys(
            newSpecs,
            new Set(forced.map((p) => p.id)),
          );
        }

        // Comanda incremental (#3): preservar lo YA enviado a cocina. Las filas
        // se recrean, así que la cantidad enviada se transfiere por huella de
        // línea (hasta la cantidad nueva; si una línea enviada se achicó, el
        // excedente enviado se pierde — la corrección va por comanda "PEDIDO
        // MODIFICADO" o de viva voz).
        const sentByKey = new Map<string, { qty: number; at: Date | null }>();
        for (const it of existing.items) {
          if (it.sentToKitchenQty <= 0) continue;
          const key = lineKey(
            it.productId,
            it.sizeId,
            ((it.modifiersJson as unknown as AppliedModifier[]) ?? []).map((m) => m.modifierId),
            it.notes,
          );
          const cur = sentByKey.get(key) ?? { qty: 0, at: null };
          cur.qty += it.sentToKitchenQty;
          if (it.sentToKitchenAt && (!cur.at || it.sentToKitchenAt > cur.at)) {
            cur.at = it.sentToKitchenAt;
          }
          sentByKey.set(key, cur);
        }
        const itemRows = computedItems.map((c) => {
          const key = lineKey(
            c.productId,
            c.sizeId,
            c.modifiers.map((m) => m.modifierId),
            c.notes,
          );
          const sent = sentByKey.get(key);
          let sentToKitchenQty = 0;
          let sentToKitchenAt: Date | null = null;
          if (sent && sent.qty > 0) {
            sentToKitchenQty = Math.min(sent.qty, c.quantity);
            sent.qty -= sentToKitchenQty;
            sentToKitchenAt = sent.at;
          }
          return { c, sentToKitchenQty, sentToKitchenAt };
        });

        const res = await tx.sale.updateMany({
          // Guard TOCTOU: si el estado avanzó entre la lectura y acá (otra tx
          // ya commiteada), abortamos — la regla de líneas bloqueadas podría
          // haber cambiado.
          where: { id: saleId, status: existing.status },
          data: {
            subtotal,
            discountTotal,
            total,
            orderDiscountKind: orderDiscountSpec?.kind ?? null,
            orderDiscountValue: orderDiscountSpec?.value ?? null,
            orderDiscountAmount,
            // Sin descuento manual el motivo se LIMPIA (quitar el descuento
            // no debe dejar un motivo colgado en la venta).
            discountReason: hasManualDiscount ? discountReason : null,
          },
        });
        if (res.count === 0) {
          throw new BadRequestException(
            'El pedido cambió de estado — recarga e intenta de nuevo.',
          );
        }
        await tx.saleItem.deleteMany({ where: { saleId } });
        await tx.saleItem.createMany({
          data: itemRows.map(({ c, sentToKitchenQty, sentToKitchenAt }) => ({
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
            manualDiscountKind: c.manualDiscountKind,
            manualDiscountValue: c.manualDiscountValue,
            sentToKitchenQty,
            sentToKitchenAt,
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
          await this.consumption.assertStockSufficient(tx, deltaMovements, tolerateStockKeys);
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

        auditMeta = {
          status: existing.status,
          totalBefore: oldTotal,
          totalAfter: total,
          itemsBefore: existing.items.map((it) => `${it.quantity}x ${it.productId}`),
          itemsAfter: computedItems.map((c) => `${c.quantity}x ${c.productId}`),
          stockDeltaMovements: deltaMovements.length,
          manualDiscount: hasManualDiscount || undefined,
        };

        return tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: includeFull() });
      }, SALE_TX_OPTS),
    );

    await this.audit.log({
      userId,
      action: 'SALE_ITEMS_EDITED',
      entityType: 'sale',
      entityId: saleId,
      metadata: auditMeta,
    });

    return toSaleDto(updated);
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
      // Re-validar DENTRO de la tx: entre la lectura inicial y acá el estado o
      // la caja pudieron cambiar (otra request). Sin esto, se reescribirían los
      // pagos de una venta cuya caja ya cerró → arqueo cerrado descuadrado.
      const fresh = await tx.sale.findUnique({
        where: { id: saleId },
        select: { status: true, shift: { select: { status: true } } },
      });
      if (!fresh) throw new NotFoundException(`Sale ${saleId} not found`);
      if (
        !PAYMENT_CHANGE_STATUSES.includes(
          fresh.status as (typeof PAYMENT_CHANGE_STATUSES)[number],
        ) ||
        (fresh.shift && fresh.shift.status !== 'OPEN')
      ) {
        throw new BadRequestException(
          'El estado de la venta o la caja cambió — recarga e intenta de nuevo.',
        );
      }
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
      const key = lineKey(line.productId, line.sizeId, line.modifierIds, line.notes);
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

/** Clave normalizada de una línea (producto + tamaño + modificadores + notas). */
function lineKey(
  productId: string,
  sizeId: string | null,
  modifierIds: readonly string[],
  notes: string | null,
): string {
  return [productId, sizeId ?? '', [...modifierIds].sort().join(','), (notes ?? '').trim()].join(
    '|',
  );
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}
