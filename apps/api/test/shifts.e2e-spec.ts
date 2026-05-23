/**
 * shifts.e2e-spec.ts
 *
 * Tests de integración para el ciclo de vida de un turno:
 *   - Abrir turno
 *   - Crear + pagar una venta CASH
 *   - Cerrar turno y verificar expectedCash y difference
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest = require('supertest');
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Shifts E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;
  let productId: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-shifts@test.local',
          fullName: 'Dueño Shifts',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'cajero-shifts@test.local',
          fullName: 'Cajero Shifts',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
      skipDuplicates: true,
    });

    duenoToken = await loginAs(request, 'dueno-shifts@test.local');
    cajeroToken = await loginAs(request, 'cajero-shifts@test.local');

    // Producto de prueba
    const prodRes = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Producto Shifts Test',
        category: 'Test',
        basePrice: 10000,
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
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Caja de un día anterior (stale): bloquea operación hasta cerrarla.
  // Va PRIMERO: usa una caja con openedAt=ayer (no cuenta como "la de hoy"),
  // la cierra y deja el negocio sin caja abierta para los tests siguientes.
  // ---------------------------------------------------------------------------
  describe('Caja de día anterior (stale)', () => {
    let staleToken: string;
    let staleShiftId: string;

    beforeAll(async () => {
      const hash = await bcrypt.hash('dev12345', 10);
      const user = await prisma.user.create({
        data: {
          email: 'cajero-stale@test.local',
          fullName: 'Cajero Stale',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      });
      staleToken = await loginAs(request, 'cajero-stale@test.local');

      // Caja abierta hace 36h (día anterior) — se inyecta directo en DB.
      const stale = await prisma.shift.create({
        data: {
          cashierId: user.id,
          openingCash: 50000,
          status: 'OPEN',
          openedAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
        },
      });
      staleShiftId = stale.id;
    });

    it('current-status marca stalePreviousDay=true', async () => {
      const res = await request
        .get('/shifts/current-status')
        .set('Authorization', `Bearer ${staleToken}`)
        .expect(200);
      expect(res.body.stalePreviousDay).toBe(true);
      expect(res.body.shift.id).toBe(staleShiftId);
    });

    it('no permite vender (COUNTER) con caja de día anterior → 409', async () => {
      await request
        .post('/sales')
        .set('Authorization', `Bearer ${staleToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(409);
    });

    it('no permite abrir otra caja con una de día anterior abierta → 409', async () => {
      await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${staleToken}`)
        .send({ openingCash: 10000 })
        .expect(409);
    });

    it('cerrar la caja vieja registra closedAt (con efectivo contado)', async () => {
      await request
        .post(`/shifts/${staleShiftId}/close`)
        .set('Authorization', `Bearer ${staleToken}`)
        .send({ countedCash: 50000 })
        .expect(201);

      const detail = await request
        .get(`/shifts/${staleShiftId}/detail`)
        .set('Authorization', `Bearer ${staleToken}`)
        .expect(200);
      expect(detail.body.shift.closedAt).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Caja ÚNICA del negocio: abrir → (rechazar 2da) → vender → cerrar
  // ---------------------------------------------------------------------------
  describe('Caja única del negocio: abrir → vender → cerrar', () => {
    let shiftId: string;
    const OPENING_CASH = 50000;
    const PRODUCT_PRICE = 10000;
    const RECEIVED = 20000;

    it('abre la caja del negocio', async () => {
      const res = await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ openingCash: OPENING_CASH, notes: 'Caja del día' })
        .expect(201);
      expect(res.body.status).toBe('OPEN');
      expect(res.body.openingCash).toBe(OPENING_CASH);
      shiftId = res.body.id as string;
    });

    it('rechaza una segunda caja mientras hay una abierta (dueño y cajero)', async () => {
      // El dueño NO puede abrir otra: ya hay una del negocio abierta.
      await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ openingCash: 99000 })
        .expect(409);
      // El mismo cajero tampoco.
      await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ openingCash: 99000 })
        .expect(409);
    });

    it('current y current-status devuelven la caja abierta del negocio', async () => {
      // Cualquier usuario (incluido el dueño que no la abrió) ve la caja única.
      const cur = await request
        .get('/shifts/current')
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(200);
      expect(cur.body.id).toBe(shiftId);

      const st = await request
        .get('/shifts/current-status')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(st.body.stalePreviousDay).toBe(false);
      expect(st.body.shift.id).toBe(shiftId);
    });

    it('movimientos de efectivo (entrada/salida) ajustan el esperado', async () => {
      await request
        .post(`/shifts/${shiftId}/cash-movements`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ type: 'IN', amount: 10000, reason: 'Fondo de cambio extra' })
        .expect(201);
      await request
        .post(`/shifts/${shiftId}/cash-movements`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ type: 'OUT', amount: 3000, reason: 'Pago a mensajero' })
        .expect(201);
      const list = await request
        .get(`/shifts/${shiftId}/cash-movements`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(list.body).toHaveLength(2);
    });

    it('vende CASH y cierra con esperado = apertura + ventas + entradas − salidas + arqueo', async () => {
      const saleRes = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(201);
      await request
        .post(`/sales/${saleRes.body.id}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ method: 'CASH', amountReceived: RECEIVED })
        .expect(201);

      // 50000 (apertura) + 10000 (venta) + 10000 (entrada) − 3000 (salida) = 67000
      const expectedCash = OPENING_CASH + PRODUCT_PRICE + 10000 - 3000;
      const countedCash = 67000; // arqueo cuadra → diferencia 0
      const res = await request
        .post(`/shifts/${shiftId}/close`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          countedCash,
          breakdown: [
            { denomination: 50000, count: 1 },
            { denomination: 10000, count: 1 },
            { denomination: 5000, count: 1 },
            { denomination: 2000, count: 1 },
          ],
          notes: 'Cierre del día',
        })
        .expect(201);
      expect(res.body.status).toBe('CLOSED');
      expect(res.body.expectedCash).toBe(expectedCash);
      expect(res.body.difference).toBe(countedCash - expectedCash); // 0

      // El detalle expone movimientos + arqueo.
      const detail = await request
        .get(`/shifts/${shiftId}/detail`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(detail.body.cashMovements).toHaveLength(2);
      expect(detail.body.cashCountBreakdown).toHaveLength(4);
    });

    it('no puede cerrar la misma caja dos veces', async () => {
      await request
        .post(`/shifts/${shiftId}/close`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ countedCash: 60000 })
        .expect(400);
    });

    it('una caja por día: tras cerrar, no se abre otra hoy', async () => {
      await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ openingCash: 30000 })
        .expect(409);
    });

    it('current devuelve vacío cuando no hay caja abierta', async () => {
      const res = await request
        .get('/shifts/current')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      const isNullish =
        res.body === null || Object.keys(res.body as object).length === 0;
      expect(isNullish).toBe(true);
    });
  });
});
