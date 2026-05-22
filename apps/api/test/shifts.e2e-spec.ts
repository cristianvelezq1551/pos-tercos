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
  // Abrir turno
  // ---------------------------------------------------------------------------
  describe('POST /shifts/open', () => {
    it('abre un turno con openingCash', async () => {
      const res = await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ openingCash: 100000, notes: 'Test shift' })
        .expect(201);

      const shift = res.body;
      expect(shift.id).toBeTruthy();
      expect(shift.status).toBe('OPEN');
      expect(shift.openingCash).toBe(100000);
    });

    it('rechaza abrir un segundo turno si ya hay uno OPEN', async () => {
      // El cajero ya tiene un turno abierto desde el test anterior
      await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ openingCash: 50000 })
        .expect(409);
    });
  });

  // ---------------------------------------------------------------------------
  // Ciclo completo: abrir → vender → cerrar
  // ---------------------------------------------------------------------------
  describe('Ciclo completo: abrir → vender → cerrar', () => {
    let cycleShiftId: string;
    const OPENING_CASH = 50000;
    const PRODUCT_PRICE = 10000;
    const RECEIVED = 20000; // cajero recibe $20.000 por $10.000

    // Usamos un cajero dedicado para este sub-suite para no colisionar
    // con el turno ya abierto de los tests anteriores.
    let cycleCajeroToken: string;

    beforeAll(async () => {
      const hash = await bcrypt.hash('dev12345', 10);
      await prisma.user.create({
        data: {
          email: 'cajero-cycle@test.local',
          fullName: 'Cajero Cycle',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      });
      cycleCajeroToken = await loginAs(request, 'cajero-cycle@test.local');

      // Abrir turno
      const shiftRes = await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${cycleCajeroToken}`)
        .send({ openingCash: OPENING_CASH })
        .expect(201);

      cycleShiftId = shiftRes.body.id as string;

      // Crear y confirmar una venta CASH
      const saleRes = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cycleCajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          items: [{ productId, quantity: 1 }],
        })
        .expect(201);

      await request
        .post(`/sales/${saleRes.body.id}/confirm-payment`)
        .set('Authorization', `Bearer ${cycleCajeroToken}`)
        .send({ method: 'CASH', amountReceived: RECEIVED })
        .expect(201);
    });

    it('cierra el turno con expectedCash y difference correctos', async () => {
      const expectedCash = OPENING_CASH + PRODUCT_PRICE; // 50000 + 10000
      const countedCash = 58000; // cajero cuenta $58.000 (sobran $2.000)

      const res = await request
        .post(`/shifts/${cycleShiftId}/close`)
        .set('Authorization', `Bearer ${cycleCajeroToken}`)
        .send({ countedCash, notes: 'Test close' })
        .expect(201);

      const shift = res.body;
      expect(shift.status).toBe('CLOSED');
      expect(shift.expectedCash).toBe(expectedCash);
      expect(shift.countedCash).toBe(countedCash);
      expect(shift.difference).toBe(countedCash - expectedCash); // -2000
    });

    it('no puede cerrar el mismo turno dos veces', async () => {
      await request
        .post(`/shifts/${cycleShiftId}/close`)
        .set('Authorization', `Bearer ${cycleCajeroToken}`)
        .send({ countedCash: 60000 })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /shifts/current
  // ---------------------------------------------------------------------------
  describe('GET /shifts/current', () => {
    it('devuelve el turno OPEN del cajero autenticado', async () => {
      // cajero-shifts@test.local tiene un turno abierto desde la primera suite
      const res = await request
        .get('/shifts/current')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);

      expect(res.body).not.toBeNull();
      expect(res.body.status).toBe('OPEN');
    });

    it('devuelve null o body vacío cuando no hay turno abierto', async () => {
      // Crear cajero sin turno
      const hash = await bcrypt.hash('dev12345', 10);
      await prisma.user.create({
        data: {
          email: 'cajero-noshift2@test.local',
          fullName: 'Cajero Sin Turno 2',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      });
      const token = await loginAs(request, 'cajero-noshift2@test.local');

      const res = await request
        .get('/shifts/current')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // NestJS serializa null como {} en JSON; aceptamos ambas formas
      const isNullish = res.body === null || Object.keys(res.body as object).length === 0;
      expect(isNullish).toBe(true);
    });
  });
});
