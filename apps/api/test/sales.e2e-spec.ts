/**
 * sales.e2e-spec.ts
 *
 * Tests de integración para el flujo crítico del dinero:
 *   - Crear venta COUNTER
 *   - Idempotencia al repetir POST /sales con el mismo key
 *   - Confirmar pago CASH → PAGADO + paidAt
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Sales E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  // Tokens
  let duenoToken: string;
  let cajeroToken: string;

  // IDs created per-suite
  let productId: string;
  let shiftId: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    // Seed dos usuarios: dueno y cajero
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-e2e@test.local',
          fullName: 'Dueño E2E',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'cajero-e2e@test.local',
          fullName: 'Cajero E2E',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
      skipDuplicates: true,
    });

    // Login
    duenoToken = await loginAs(request, 'dueno-e2e@test.local');
    cajeroToken = await loginAs(request, 'cajero-e2e@test.local');


    // NEQUI viene deshabilitado por defecto (medios de pago configurables).
    await request
      .put('/payment-methods')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ methods: [{ method: 'NEQUI', enabled: true }] })
      .expect(200);

    // Crear un producto simple (sin tallas ni modificadores)
    const prodRes = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Hamburguesa Test',
        category: 'Combos',
        basePrice: 15000,
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

    productId = prodRes.body.id as string;

    // Abrir turno para el cajero
    const shiftRes = await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ openingCash: 50000 })
      .expect(201);

    shiftId = shiftRes.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Caso 1: crear venta COUNTER
  // ---------------------------------------------------------------------------
  describe('POST /sales — COUNTER', () => {
    it('crea la venta con status PENDIENTE_PAGO y receiptNumber asignado', async () => {
      const res = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          items: [{ productId, quantity: 2 }],
        })
        .expect(201);

      const sale = res.body;
      expect(sale.id).toBeTruthy();
      expect(sale.status).toBe('PENDIENTE_PAGO');
      expect(typeof sale.receiptNumber).toBe('number');
      expect(sale.receiptNumber).toBeGreaterThan(0);
      expect(sale.total).toBe(30000); // 2 × 15000
      expect(sale.type).toBe('COUNTER');
      expect(sale.shiftId).toBe(shiftId);
    });

    it('caja ÚNICA del negocio: otro cajero vende sobre la caja abierta', async () => {
      // Con una sola caja por negocio, cualquier cajero opera la caja abierta
      // aunque no la haya abierto él (no hay "turno por cajero").
      const hash = await bcrypt.hash('dev12345', 10);
      await prisma.user.create({
        data: {
          email: 'cajero-otro@test.local',
          fullName: 'Cajero Otro',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      });
      const token = await loginAs(request, 'cajero-otro@test.local');

      const res = await request
        .post('/sales')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          items: [{ productId, quantity: 1 }],
        })
        .expect(201);
      // La venta se adjunta a la caja única del negocio.
      expect(res.body.shiftId).toBe(shiftId);
    });

    it('rechaza body vacío (sin items)', async () => {
      await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ type: 'COUNTER', items: [] })
        .expect(400);
    });

    it('rechaza producto inexistente (404 o 400)', async () => {
      const res = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          type: 'COUNTER',
          items: [{ productId: randomUUID(), quantity: 1 }],
        });
      // El service lanza NotFoundException (404) cuando el producto no existe
      expect([400, 404]).toContain(res.status);
    });
  });

  // ---------------------------------------------------------------------------
  // Caso 2: idempotencia
  // ---------------------------------------------------------------------------
  describe('POST /sales — idempotencia', () => {
    it('retorna la misma venta al repetir con idéntico Idempotency-Key', async () => {
      const idemKey = randomUUID();

      const first = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', idemKey)
        .send({
          type: 'COUNTER',
          items: [{ productId, quantity: 1 }],
        })
        .expect(201);

      const second = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', idemKey)
        .send({
          type: 'COUNTER',
          items: [{ productId, quantity: 1 }],
        })
        .expect(201);

      // Misma venta, no duplicada
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.receiptNumber).toBe(first.body.receiptNumber);

      // Verificar en DB que solo existe una venta con ese key
      const count = await prisma.sale.count({
        where: { idempotencyKey: idemKey },
      });
      expect(count).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Caso 3: confirmar pago CASH
  // ---------------------------------------------------------------------------
  describe('POST /sales/:id/confirm-payment — CASH', () => {
    let saleId: string;

    beforeEach(async () => {
      const res = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          items: [{ productId, quantity: 1 }],
        })
        .expect(201);
      saleId = res.body.id as string;
    });

    it('confirma el pago y pasa a PAGADO con paidAt poblado', async () => {
      const res = await request
        .post(`/sales/${saleId}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          method: 'CASH',
          amountReceived: 20000,
        })
        .expect(201);

      const paid = res.body;
      expect(paid.status).toBe('PAGADO');
      expect(paid.paymentMethod).toBe('CASH');
      expect(paid.paidAt).toBeTruthy();
      expect(new Date(paid.paidAt as string).getTime()).toBeGreaterThan(0);
    });

    it('no permite confirmar pago en una venta ya PAGADA', async () => {
      // Primera confirmación
      await request
        .post(`/sales/${saleId}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ method: 'CASH', amountReceived: 20000 })
        .expect(201);

      // Segunda confirmación del mismo sale
      await request
        .post(`/sales/${saleId}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ method: 'CASH', amountReceived: 20000 })
        .expect(400);
    });

    it('rechaza confirmación digital sin doble verificación', async () => {
      await request
        .post(`/sales/${saleId}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          method: 'NEQUI',
          amountReceived: 15000,
          // digitalDoubleVerified omitido → debe fallar
        })
        .expect(400);
    });

    it('acepta confirmación digital con doble verificación', async () => {
      const res = await request
        .post(`/sales/${saleId}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          method: 'NEQUI',
          amountReceived: 15000,
          digitalDoubleVerified: true,
        })
        .expect(201);

      expect(res.body.status).toBe('PAGADO');
      expect(res.body.paymentMethod).toBe('NEQUI');
    });
  });

  // ---------------------------------------------------------------------------
  // Caso 3.4: comanda de cocina + cancelar cobro abandonado
  // ---------------------------------------------------------------------------
  describe('Comanda + cancelar venta pendiente', () => {
    let saleId: string;

    beforeEach(async () => {
      const res = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 2 }] })
        .expect(201);
      saleId = res.body.id as string;
    });

    it('genera la comanda ESC/POS con la venta aún PENDIENTE_PAGO', async () => {
      const res = await request
        .get(`/sales/${saleId}/comanda-escpos`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(typeof res.body.escposBase64).toBe('string');
      expect(res.body.reprint).toBe(false);
      const decoded = Buffer.from(res.body.escposBase64 as string, 'base64').toString('latin1');
      expect(decoded).toContain('COMANDA COCINA');
      expect(decoded).toContain('Hamburguesa Test');
      // Sin turno asignado (no se ha pagado) → identifica por pedido.
      expect(decoded).toContain(`PEDIDO #${res.body.receiptNumber}`);

      // Segunda impresión queda marcada como reimpresión + audit.
      const again = await request
        .get(`/sales/${saleId}/comanda-escpos`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(again.body.reprint).toBe(true);
      const logs = await prisma.auditLog.count({
        where: { action: 'COMANDA_PRINTED', entityId: saleId },
      });
      expect(logs).toBe(2);
    });

    it('cancela un cobro abandonado COUNTER (PENDIENTE_PAGO → CANCELADO_NO_PAGO)', async () => {
      const res = await request
        .post(`/sales/${saleId}/cancel`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(res.body.status).toBe('CANCELADO_NO_PAGO');

      // Una venta ya pagada NO se puede cancelar por esta vía.
      await request
        .post(`/sales/${saleId}/cancel`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Caso 3.45: barrido de cobros abandonados
  // ---------------------------------------------------------------------------
  describe('POST /sales/admin/sweep-stale-pending', () => {
    it('cancela COUNTER pendientes viejos; respeta recientes y pedidos web', async () => {
      // Venta COUNTER vieja (45 min) → debe barrerse.
      const oldSale = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(201);
      await prisma.sale.update({
        where: { id: oldSale.body.id as string },
        data: { createdAt: new Date(Date.now() - 45 * 60_000) },
      });
      // Venta COUNTER fresca → debe quedar intacta.
      const freshSale = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(201);

      const res = await request
        .post('/sales/admin/sweep-stale-pending')
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(201);
      expect(res.body.canceled).toBeGreaterThanOrEqual(1);

      const swept = await prisma.sale.findUnique({
        where: { id: oldSale.body.id as string },
        select: { status: true },
      });
      expect(swept!.status).toBe('CANCELADO_NO_PAGO');
      const fresh = await prisma.sale.findUnique({
        where: { id: freshSale.body.id as string },
        select: { status: true },
      });
      expect(fresh!.status).toBe('PENDIENTE_PAGO');

      const log = await prisma.auditLog.findFirst({
        where: { action: 'STALE_SALES_SWEPT' },
      });
      expect(log).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Caso 3.5: POST /sales/sync-offline (Fase B.3)
  // ---------------------------------------------------------------------------
  describe('POST /sales/sync-offline', () => {
    const buildBody = (localId: string) => ({
      localId,
      provisionalNumber: 'OFF-1',
      soldOfflineAt: new Date('2026-05-24T14:00:00.000Z').toISOString(),
      payment: { method: 'CASH', amountReceived: 15000, offlineVerified: false },
      payload: {
        type: 'COUNTER',
        customerName: null,
        lines: [
          {
            productId,
            sizeId: null,
            quantity: 1,
            unitPrice: 15000,
            modifiers: [],
            notes: null,
            lineSubtotal: 15000,
            lineDiscount: 0,
            lineTotal: 15000,
            appliedPromotionId: null,
          },
        ],
        subtotal: 15000,
        discount: 0,
        total: 15000,
      },
    });

    it('registra la venta offline ENTREGADO con recibo y turno reales + paidAt backdateado', async () => {
      const res = await request
        .post('/sales/sync-offline')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send(buildBody(randomUUID()))
        .expect(201);

      const sale = res.body;
      expect(sale.status).toBe('ENTREGADO');
      expect(typeof sale.receiptNumber).toBe('number');
      expect(sale.receiptNumber).toBeGreaterThan(0);
      expect(sale.turnNumber).toBeGreaterThan(0);
      expect(sale.total).toBe(15000);
      expect(sale.paymentMethod).toBe('CASH');
      // paidAt backdateado al momento real de la venta offline.
      expect(new Date(sale.paidAt).toISOString()).toBe('2026-05-24T14:00:00.000Z');
    });

    it('rechaza una venta offline con reloj adelantado (>15 min en el futuro)', async () => {
      const body = buildBody(randomUUID());
      body.soldOfflineAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const res = await request
        .post('/sales/sync-offline')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send(body)
        .expect(400);
      expect(res.body.message).toContain('reloj');
      const log = await prisma.auditLog.findFirst({
        where: { action: 'OFFLINE_SYNC_CLOCK_DRIFT' },
      });
      expect(log).toBeTruthy();
    });

    it('es idempotente por localId (reintento devuelve la misma venta)', async () => {
      const localId = randomUUID();
      const first = await request
        .post('/sales/sync-offline')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send(buildBody(localId))
        .expect(201);
      const second = await request
        .post('/sales/sync-offline')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send(buildBody(localId))
        .expect(201);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.receiptNumber).toBe(first.body.receiptNumber);
    });
  });

  // ---------------------------------------------------------------------------
  // Caso 4: GET /sales/:id y GET /sales
  // ---------------------------------------------------------------------------
  describe('GET /sales', () => {
    it('lista ventas del cajero autenticado', async () => {
      const res = await request
        .get('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('rechaza acceso sin token', async () => {
      await request.get('/sales').expect(401);
    });
  });
});
