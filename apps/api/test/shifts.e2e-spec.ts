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
import { startOfBusinessDay } from '@pos-tercos/domain';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
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
  // Día de NEGOCIO (corte 4 am, 2026-07-09): la caja puede cruzar la medianoche
  // sin volverse stale; el día de la caja va de 4 am a 4 am. Los openedAt se
  // derivan del corte ACTUAL (startOfBusinessDay) para que los tests sean
  // deterministas a cualquier hora en que corra la suite.
  // ---------------------------------------------------------------------------
  describe('Día de negocio (corte 4 am): la caja cruza la medianoche', () => {
    let bizToken: string;
    let bizUserId: string;

    beforeAll(async () => {
      const hash = await bcrypt.hash('dev12345', 10);
      const user = await prisma.user.create({
        data: {
          email: 'cajero-bizday@test.local',
          fullName: 'Cajero BizDay',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      });
      bizUserId = user.id;
      bizToken = await loginAs(request, 'cajero-bizday@test.local');
    });

    afterEach(async () => {
      // Estos tests no crean ventas → delete directo (sin hijos con trigger).
      await prisma.shift.deleteMany({ where: { cashierId: bizUserId } });
    });

    it('caja abierta AL inicio del día de negocio (4 am) NO es stale', async () => {
      // Equivale a la caja de anoche vista de madrugada: mismo día de negocio.
      await prisma.shift.create({
        data: {
          cashierId: bizUserId,
          openingCash: 30000,
          status: 'OPEN',
          openedAt: startOfBusinessDay(new Date()),
        },
      });
      const res = await request
        .get('/shifts/current-status')
        .set('Authorization', `Bearer ${bizToken}`)
        .expect(200);
      expect(res.body.stalePreviousDay).toBe(false);
    });

    it('caja abierta justo ANTES del corte (3:59 am) SÍ es stale', async () => {
      const beforeCutoff = new Date(startOfBusinessDay(new Date()).getTime() - 60_000);
      await prisma.shift.create({
        data: {
          cashierId: bizUserId,
          openingCash: 30000,
          status: 'OPEN',
          openedAt: beforeCutoff,
        },
      });
      const res = await request
        .get('/shifts/current-status')
        .set('Authorization', `Bearer ${bizToken}`)
        .expect(200);
      expect(res.body.stalePreviousDay).toBe(true);
    });

    it('una caja CERRADA del día de negocio anterior no consume el cupo de hoy', async () => {
      // Caja "de anoche" cerrada de madrugada (antes del corte): abrir la de
      // hoy debe funcionar — antes, con corte a medianoche, un cierre a las
      // 2 am bloqueaba la apertura de ese mismo día calendario.
      const boundary = startOfBusinessDay(new Date());
      await prisma.shift.create({
        data: {
          cashierId: bizUserId,
          openingCash: 30000,
          status: 'CLOSED',
          openedAt: new Date(boundary.getTime() - 60 * 60_000),
          closedAt: new Date(boundary.getTime() - 30 * 60_000),
          expectedCash: 30000,
          countedCash: 30000,
          difference: 0,
        },
      });
      await request
        .post('/shifts/open')
        .set('Authorization', `Bearer ${bizToken}`)
        .send({ openingCash: 20000 })
        .expect(201);
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
      // Movimiento DIGITAL: no toca el cajón, ajusta el arqueo de TRANSFER.
      const mov = await request
        .post(`/shifts/${shiftId}/cash-movements`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          type: 'OUT',
          method: 'TRANSFER',
          amount: 2000,
          reason: 'Pago insumo por transferencia',
        })
        .expect(201);
      expect(mov.body.method).toBe('TRANSFER');
      const list = await request
        .get(`/shifts/${shiftId}/cash-movements`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(list.body).toHaveLength(3);
    });

    it('un movimiento mal registrado se corrige o elimina con la caja abierta', async () => {
      // Registrado con monto equivocado…
      const created = await request
        .post(`/shifts/${shiftId}/cash-movements`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ type: 'OUT', amount: 50000, reason: 'Pago hielo (monto mal)' })
        .expect(201);
      const movementId = created.body.id as string;

      // …se corrige (PATCH reemplaza el movimiento completo).
      const updated = await request
        .patch(`/shifts/${shiftId}/cash-movements/${movementId}`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ type: 'OUT', amount: 5000, reason: 'Pago hielo' })
        .expect(200);
      expect(updated.body.amount).toBe(5000);
      expect(updated.body.reason).toBe('Pago hielo');

      // Y si fue por error total, se elimina.
      await request
        .delete(`/shifts/${shiftId}/cash-movements/${movementId}`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      const list = await request
        .get(`/shifts/${shiftId}/cash-movements`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(
        (list.body as Array<{ id: string }>).find((m) => m.id === movementId),
      ).toBeUndefined();

      // Ambas correcciones quedan en bitácora con el antes/después.
      const updateLog = await prisma.auditLog.findFirst({
        where: { action: 'CASH_MOVEMENT_UPDATED', entityId: shiftId },
      });
      const deleteLog = await prisma.auditLog.findFirst({
        where: { action: 'CASH_MOVEMENT_DELETED', entityId: shiftId },
      });
      expect(updateLog).toBeTruthy();
      expect((updateLog!.metadata as { before: { amount: number } }).before.amount).toBe(50000);
      expect((updateLog!.metadata as { after: { amount: number } }).after.amount).toBe(5000);
      expect(deleteLog).toBeTruthy();

      // Movimiento ajeno a la caja → 404.
      await request
        .delete(`/shifts/${shiftId}/cash-movements/${randomUUID()}`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(404);
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

      // Venta por TRANSFER para arquear lo digital al cierre.
      const transferSale = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(201);
      await request
        .post(`/sales/${transferSale.body.id}/confirm-payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          method: 'TRANSFER',
          amountReceived: PRODUCT_PRICE,
          digitalDoubleVerified: true,
        })
        .expect(201);

      // 50000 (apertura) + 10000 (venta CASH) + 10000 (entrada) − 3000 (salida) = 67000.
      // El movimiento TRANSFER (−2000) NO toca el cajón físico.
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
          // Esperado TRANSFER = 10000 (venta) − 2000 (movimiento OUT) = 8000.
          digitalCounts: [{ method: 'TRANSFER', counted: 8000 }],
          // Propinas: bote aparte — NO afectan el esperado de la caja.
          tips: 12000,
          notes: 'Cierre del día',
        })
        .expect(201);
      expect(res.body.status).toBe('CLOSED');
      expect(res.body.expectedCash).toBe(expectedCash);
      expect(res.body.difference).toBe(countedCash - expectedCash); // 0
      expect(res.body.tipsCollected).toBe(12000);

      // El detalle expone movimientos + arqueo físico y digital.
      const detail = await request
        .get(`/shifts/${shiftId}/detail`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      expect(detail.body.cashMovements).toHaveLength(3);
      expect(detail.body.cashCountBreakdown).toHaveLength(4);
      const transfer = (
        detail.body.shift.digitalCountBreakdown as Array<{
          method: string;
          expected: number;
          counted: number | null;
          difference: number | null;
        }>
      ).find((d) => d.method === 'TRANSFER');
      expect(transfer).toBeDefined();
      expect(transfer!.expected).toBe(8000);
      expect(transfer!.counted).toBe(8000);
      expect(transfer!.difference).toBe(0);
    });

    it('no puede cerrar la misma caja dos veces', async () => {
      await request
        .post(`/shifts/${shiftId}/close`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ countedCash: 60000 })
        .expect(400);
    });

    it('caja cerrada: los movimientos son inmutables (400)', async () => {
      const list = await request
        .get(`/shifts/${shiftId}/cash-movements`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(200);
      const movementId = (list.body as Array<{ id: string }>)[0]!.id;
      await request
        .patch(`/shifts/${shiftId}/cash-movements/${movementId}`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ type: 'IN', amount: 1000, reason: 'no debería' })
        .expect(400);
      await request
        .delete(`/shifts/${shiftId}/cash-movements/${movementId}`)
        .set('Authorization', `Bearer ${cajeroToken}`)
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

  // ---------------------------------------------------------------------------
  // Reabrir caja respeta la invariante "caja única del negocio".
  // ---------------------------------------------------------------------------
  describe('Reopen no crea una segunda caja OPEN', () => {
    let cashierXId: string;
    let cashierYId: string;
    let closedShiftId: string;
    let openShiftId: string;

    beforeAll(async () => {
      const hash = await bcrypt.hash('dev12345', 10);
      const x = await prisma.user.create({
        data: { email: 'cajero-x@test.local', fullName: 'Cajero X', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      });
      const y = await prisma.user.create({
        data: { email: 'cajero-y@test.local', fullName: 'Cajero Y', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      });
      cashierXId = x.id;
      cashierYId = y.id;
      // Caja A (cajero X) CERRADA + caja B (cajero Y) ABIERTA → escenario donde
      // el viejo check (por cashierId) dejaba reabrir A y quedaban dos OPEN.
      const closed = await prisma.shift.create({
        data: {
          cashierId: cashierXId,
          openingCash: 0,
          status: 'CLOSED',
          openedAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
          closedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        },
      });
      closedShiftId = closed.id;
      const open = await prisma.shift.create({
        data: { cashierId: cashierYId, openingCash: 0, status: 'OPEN' },
      });
      openShiftId = open.id;
    });

    it('rechaza reabrir A mientras B (de otro cajero) está abierta → 409', async () => {
      await request
        .post(`/shifts/${closedShiftId}/reopen`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(409);
    });

    it('permite reabrir A una vez que B se cierra', async () => {
      await prisma.shift.update({ where: { id: openShiftId }, data: { status: 'CLOSED', closedAt: new Date() } });
      const res = await request
        .post(`/shifts/${closedShiftId}/reopen`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(201);
      expect(res.body.status).toBe('OPEN');
      // No quedan dos OPEN: exactamente una.
      const openCount = await prisma.shift.count({ where: { status: 'OPEN' } });
      expect(openCount).toBe(1);
    });
  });
});
