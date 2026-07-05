/**
 * open-tabs-discounts.e2e-spec.ts — Bloque de ventas 2026-07:
 *  - #3 Cuentas abiertas: create openTab, comanda incremental (send-to-kitchen),
 *    exención del sweep de abandonadas, cancelación.
 *  - #5b Descuento manual: línea + total, excluyente con promos, motivo
 *    obligatorio, audit.
 *  - B3: creates concurrentes con la misma Idempotency-Key no explotan en 500.
 *  - B4: cobrar con la caja cerrada (sin otra abierta) se rechaza.
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Open Tabs + Manual Discounts E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;
  let shiftId: string;

  let burgerId: string; // preparación
  let gaseosaId: string; // reventa directa
  /** Venta PAGADA en la caja original (para el test de devolución cross-caja). */
  let paidTabId: string;
  let paidTabTotal = 0;

  const BURGER_PRICE = 10_000;
  const GASEOSA_PRICE = 4_000;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-tabs@test.local', fullName: 'Dueño Tabs', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-tabs@test.local', fullName: 'Cajero Tabs', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-tabs@test.local');
    cajeroToken = await loginAs(request, 'cajero-tabs@test.local');

    const burger = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Burger Tabs',
        category: 'Comidas',
        basePrice: BURGER_PRICE,
        isActive: true,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'unit',
        unitStock: 'unit',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    burgerId = burger.body.id as string;

    const gaseosa = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Gaseosa Tabs',
        category: 'Bebidas',
        basePrice: GASEOSA_PRICE,
        isActive: true,
        directResale: true,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'unit',
        unitStock: 'unit',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    gaseosaId = gaseosa.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'PRODUCT', productId: gaseosaId, delta: 50, type: 'INITIAL', notes: 'stock inicial test' })
      .expect(201);

    // Promo 20% sobre la burger — para verificar la exclusión con descuento manual.
    await request
      .post('/promotions')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Promo Tabs 20%',
        type: 'PERCENT_OFF',
        discountPct: 0.2,
        daysOfWeekMask: 127,
        timeStart: '00:00:00',
        timeEnd: '23:59:59',
        productIds: [burgerId],
      })
      .expect(201);

    const shift = await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ openingCash: 50000 })
      .expect(201);
    shiftId = shift.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ================================================================
  // #3 CUENTAS ABIERTAS
  // ================================================================

  describe('cuentas abiertas (#3)', () => {
    it('rechaza abrir cuenta sin nombre de cliente', async () => {
      await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', openTab: true, items: [{ productId: burgerId, quantity: 1 }] })
        .expect(400);
    });

    it('crea la cuenta abierta, manda tandas incrementales y cobra al final', async () => {
      const created = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          openTab: true,
          customerName: 'Don Pedro',
          items: [{ productId: burgerId, quantity: 2 }],
        })
        .expect(201);
      const tabId = created.body.id as string;
      expect(created.body.isOpenTab).toBe(true);
      expect(created.body.status).toBe('PENDIENTE_PAGO');
      expect(created.body.items[0].sentToKitchenQty).toBe(0);

      // Tanda 1: manda TODO lo pendiente y estampa.
      const batch1 = await request
        .post(`/sales/${tabId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(batch1.body.batch).toBe(1);
      expect(batch1.body.pendingCount).toBe(1);
      expect(batch1.body.kitchen.itemCount).toBe(1);
      expect(typeof batch1.body.full.escposBase64).toBe('string');

      // Re-enviar sin cambios: no hay nada pendiente.
      const noop = await request
        .post(`/sales/${tabId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(noop.body.pendingCount).toBe(0);

      // Editar la cuenta: +1 burger y una gaseosa. Lo enviado se PRESERVA.
      const edited = await request
        .patch(`/sales/${tabId}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          items: [
            { productId: burgerId, quantity: 3 },
            { productId: gaseosaId, quantity: 1 },
          ],
        })
        .expect(200);
      const burgerLine = edited.body.items.find(
        (it: { productId: string }) => it.productId === burgerId,
      );
      expect(burgerLine.sentToKitchenQty).toBe(2); // carry-over de la tanda 1

      // Tanda 2: solo lo NUEVO (1 burger + 1 gaseosa).
      const batch2 = await request
        .post(`/sales/${tabId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(batch2.body.batch).toBe(2);
      expect(batch2.body.pendingCount).toBe(2);

      // Cobrar la cuenta (el flujo normal de confirm-payment).
      const paid = await request
        .post(`/sales/${tabId}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ method: 'CASH', amountReceived: 100_000 })
        .expect(201);
      expect(paid.body.status).toBe('PAGADO');
      // 3 burgers con promo 20% + gaseosa sin promo.
      expect(paid.body.total).toBe(3 * BURGER_PRICE * 0.8 + GASEOSA_PRICE);
      paidTabId = paid.body.id as string;
      paidTabTotal = paid.body.total as number;
    });

    it('el sweep de abandonadas NO toca cuentas abiertas (pero sí las huérfanas)', async () => {
      const tab = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          openTab: true,
          customerName: 'Doña Rosa',
          items: [{ productId: burgerId, quantity: 1 }],
        })
        .expect(201);
      const orphan = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId: burgerId, quantity: 1 }] })
        .expect(201);

      // Backdatear ambas más allá del umbral del sweep (30 min).
      const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await prisma.sale.updateMany({
        where: { id: { in: [tab.body.id, orphan.body.id] } },
        data: { createdAt: old },
      });

      await request
        .post('/sales/admin/sweep-stale-pending')
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(201);

      const tabAfter = await prisma.sale.findUnique({ where: { id: tab.body.id } });
      const orphanAfter = await prisma.sale.findUnique({ where: { id: orphan.body.id } });
      expect(tabAfter!.status).toBe('PENDIENTE_PAGO'); // la cuenta sigue viva
      expect(orphanAfter!.status).toBe('CANCELADO_NO_PAGO'); // la huérfana se barre

      // Cancelar la cuenta manualmente sí funciona.
      const canceled = await request
        .post(`/sales/${tab.body.id}/cancel`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(canceled.body.status).toBe('CANCELADO_NO_PAGO');
    });
  });

  // ================================================================
  // #5b DESCUENTO MANUAL
  // ================================================================

  describe('descuento manual (#5b)', () => {
    it('rechaza descuento sin motivo', async () => {
      await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          items: [
            { productId: burgerId, quantity: 1, manualDiscount: { kind: 'FIXED', value: 1000 } },
          ],
        })
        .expect(400);
    });

    it('descuento por línea ignora promos y notifica; queda en audit', async () => {
      const res = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          discountReason: 'cliente frecuente',
          items: [
            // Sin descuento manual, la promo 20% daría 2000 de descuento.
            { productId: burgerId, quantity: 1, manualDiscount: { kind: 'FIXED', value: 1500 } },
          ],
        })
        .expect(201);
      expect(res.body.items[0].appliedPromotionId).toBeNull(); // promo NO corre
      expect(res.body.items[0].manualDiscount).toEqual({ kind: 'FIXED', value: 1500 });
      expect(res.body.discountTotal).toBe(1500);
      expect(res.body.total).toBe(BURGER_PRICE - 1500);
      expect(res.body.discountReason).toBe('cliente frecuente');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'SALE_MANUAL_DISCOUNT', entityId: res.body.id },
      });
      expect(audit).not.toBeNull();
    });

    it('descuento sobre el total (%) se aplica tras los de línea', async () => {
      const res = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          discountReason: 'combo con la mesa de al lado',
          orderDiscount: { kind: 'PERCENT', value: 10 },
          items: [
            { productId: burgerId, quantity: 2 }, // 20.000 — SIN promo (excluyente)
            { productId: gaseosaId, quantity: 1 }, // 4.000
          ],
        })
        .expect(201);
      expect(res.body.subtotal).toBe(24_000);
      expect(res.body.orderDiscountAmount).toBe(2_400);
      expect(res.body.discountTotal).toBe(2_400);
      expect(res.body.total).toBe(21_600);
      expect(res.body.orderDiscount).toEqual({ kind: 'PERCENT', value: 10 });
      // La promo del 20% sobre burgers NO corrió (excluyente).
      const burgerLine = res.body.items.find(
        (it: { productId: string }) => it.productId === burgerId,
      );
      expect(burgerLine.appliedPromotionId).toBeNull();

      // El cobro valida contra el total CON descuento.
      await request
        .post(`/sales/${res.body.id}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ method: 'CASH', amountReceived: 21_600 })
        .expect(201);
    });

    it('editItems puede setear y quitar el descuento sobre el total', async () => {
      const created = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          openTab: true,
          customerName: 'Mesa 4',
          items: [{ productId: gaseosaId, quantity: 2 }],
        })
        .expect(201);

      const withDiscount = await request
        .patch(`/sales/${created.body.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          items: [{ productId: gaseosaId, quantity: 2 }],
          orderDiscount: { kind: 'FIXED', value: 2000 },
          discountReason: 'demora en la entrega',
        })
        .expect(200);
      expect(withDiscount.body.total).toBe(2 * GASEOSA_PRICE - 2000);
      expect(withDiscount.body.orderDiscountAmount).toBe(2000);

      const cleared = await request
        .patch(`/sales/${created.body.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          items: [{ productId: gaseosaId, quantity: 2 }],
          orderDiscount: null,
        })
        .expect(200);
      expect(cleared.body.orderDiscountAmount).toBe(0);
      expect(cleared.body.total).toBe(2 * GASEOSA_PRICE);
    });
  });

  // ================================================================
  // B3 — idempotencia concurrente
  // ================================================================

  describe('B3 — creates concurrentes con la misma key', () => {
    it('no hay 500: ambas respuestas devuelven la MISMA venta', async () => {
      const key = randomUUID();
      const payload = { type: 'COUNTER', items: [{ productId: gaseosaId, quantity: 1 }] };
      const [a, b] = await Promise.all([
        request
          .post('/sales')
          .set('Authorization', `Bearer ${cajeroToken}`)
          .set('Idempotency-Key', key)
          .send(payload),
        request
          .post('/sales')
          .set('Authorization', `Bearer ${cajeroToken}`)
          .set('Idempotency-Key', key)
          .send(payload),
      ]);
      expect([a.status, b.status].every((s) => s === 201)).toBe(true);
      expect(a.body.id).toBe(b.body.id);
      const count = await prisma.sale.count({ where: { idempotencyKey: key } });
      expect(count).toBe(1);
    });
  });

  // ================================================================
  // B4 — caja cerrada al cobrar (VA ÚLTIMO: cierra la caja de la suite)
  // ================================================================

  describe('B4 — cobrar con la caja cerrada', () => {
    it('rechaza el cobro si la caja de la venta cerró y no hay otra abierta', async () => {
      const created = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId: gaseosaId, quantity: 1 }] })
        .expect(201);

      await request
        .post(`/shifts/${shiftId}/close`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ countedCash: 0 })
        .expect(201);

      const res = await request
        .post(`/sales/${created.body.id}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ method: 'CASH', amountReceived: GASEOSA_PRICE })
        .expect(400);
      expect(String(res.body.message)).toContain('caja');
    });
  });

  // ================================================================
  // D-H2 — anular una venta cuya caja YA cerró registra la devolución
  // en la caja ABIERTA actual (movimiento OUT por parte de pago)
  // ================================================================

  describe('devolución cross-caja al anular (auditoría D-H2)', () => {
    it('el void con caja original cerrada crea el movimiento OUT en la caja de hoy', async () => {
      // La caja de la suite ya quedó CLOSED (test B4). Se backdatea a AYER
      // para poder abrir la caja de HOY (una caja por día calendario).
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await prisma.shift.update({
        where: { id: shiftId },
        data: { openedAt: yesterday, closedAt: yesterday },
      });
      const shiftB = await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ openingCash: 20_000 })
        .expect(201);

      // PIN de aprobación del dueño para el void.
      await request
        .post('/approvals/pin')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ pin: '123456', password: 'dev12345' })
        .expect((res) => {
          if (res.status >= 300) throw new Error(`PIN setup falló: ${res.status}`);
        });

      const voided = await request
        .post(`/sales/${paidTabId}/void`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('X-Approval-Pin', '123456')
        .send({ reason: 'pedido equivocado, cliente devolvió' })
        .expect(201);
      expect(voided.body.status).toBe('VOID');

      // La plata salió del cajón de HOY → movimiento OUT method CASH en B.
      const movements = await prisma.cashMovement.findMany({
        where: { shiftId: shiftB.body.id as string, type: 'OUT' },
      });
      expect(movements).toHaveLength(1);
      expect(Number(movements[0]!.amount)).toBe(paidTabTotal);
      expect(movements[0]!.method).toBe('CASH');
      expect(movements[0]!.reason).toContain('Devolución venta');
    });

    it('sin caja abierta, el void de una venta de caja cerrada se bloquea', async () => {
      // Cerrar la caja B → no queda ninguna abierta.
      const open = await prisma.shift.findFirst({ where: { status: 'OPEN' } });
      await request
        .post(`/shifts/${open!.id}/close`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ countedCash: 0 })
        .expect(201);

      // Otra venta PAGADA de la caja vieja (la del test de descuento por línea).
      const anyPaid = await prisma.sale.findFirst({
        where: { status: 'PAGADO', shiftId: { not: null } },
      });
      expect(anyPaid).not.toBeNull();
      const res = await request
        .post(`/sales/${anyPaid!.id}/void`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('X-Approval-Pin', '123456')
        .send({ reason: 'intento sin caja abierta' })
        .expect(400);
      expect(String(res.body.message)).toContain('devolución');
    });
  });
});
