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
import supertest = require('supertest');
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const TEST_DB_URL = process.env.DATABASE_URL;

describe('Sales E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: supertest.SuperTest<supertest.Test>;

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

    it('rechaza COUNTER sin turno abierto', async () => {
      // Crear usuario sin turno
      const hash = await bcrypt.hash('dev12345', 10);
      await prisma.user.create({
        data: {
          email: 'cajero-noshift@test.local',
          fullName: 'Cajero Sin Turno',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      });
      const token = await loginAs(request, 'cajero-noshift@test.local');

      await request
        .post('/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'COUNTER',
          items: [{ productId, quantity: 1 }],
        })
        .expect(400);
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
