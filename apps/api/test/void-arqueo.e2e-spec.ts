/**
 * void-arqueo.e2e-spec.ts — Mutante M4 del informe de calidad (A6):
 * ningún test verificaba que una venta ANULADA salga del arqueo del turno.
 * Si alguien quitara VOID del `notIn` del esperado de caja o del detalle de
 * sesión, el descuadre sería silencioso. Este spec lo fija.
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('VOID fuera del arqueo E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;
  let shiftId: string;
  let gaseosaId: string;

  const PRICE = 10_000;
  const OPENING = 50_000;

  const paySale = async (): Promise<string> => {
    const created = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: gaseosaId, quantity: 1 }] })
      .expect(201);
    await request
      .post(`/sales/${created.body.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ method: 'CASH', amountReceived: PRICE })
      .expect(201);
    return created.body.id as string;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-void@test.local', fullName: 'Dueño Void', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-void@test.local', fullName: 'Cajero Void', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-void@test.local');
    cajeroToken = await loginAs(request, 'cajero-void@test.local');

    const gaseosa = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Gaseosa Void',
        category: 'Bebidas',
        basePrice: PRICE,
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
      .send({ entityType: 'PRODUCT', productId: gaseosaId, delta: 20, type: 'INITIAL', notes: 'stock test' })
      .expect(201);

    await request
      .post('/approvals/pin')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ pin: '654321', password: 'dev12345' })
      .expect((res) => {
        if (res.status >= 300) throw new Error(`PIN setup falló: ${res.status}`);
      });

    const shift = await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ openingCash: OPENING })
      .expect(201);
    shiftId = shift.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('anular una venta la saca del efectivo esperado Y del detalle del turno', async () => {
    await paySale();
    const toVoid = await paySale();

    // Antes del void: las 2 ventas suman al esperado.
    const before = await request
      .get(`/shifts/${shiftId}/expected-cash`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(200);
    expect(before.body.expectedCash).toBe(OPENING + 2 * PRICE);

    await request
      .post(`/sales/${toVoid}/void`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('X-Approval-Pin', '654321')
      .send({ reason: 'venta equivocada del test' })
      .expect(201);

    // El esperado baja EXACTAMENTE la venta anulada (no queda plata fantasma).
    const after = await request
      .get(`/shifts/${shiftId}/expected-cash`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(200);
    expect(after.body.expectedCash).toBe(OPENING + PRICE);
    expect(after.body.cashSalesTotal).toBe(PRICE);

    // El detalle de sesión tampoco la cuenta como ingreso: revenue = 1×PRICE,
    // byMethod CASH sin la anulada, y el void queda contado como voidCount.
    const detail = await request
      .get(`/shifts/${shiftId}/detail`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(detail.body.summary.totalRevenue).toBe(PRICE);
    expect(detail.body.summary.cashRevenue).toBe(PRICE);
    expect(detail.body.summary.voidCount).toBe(1);
    const cash = detail.body.summary.byMethod.find(
      (m: { method: string }) => m.method === 'CASH',
    );
    expect(cash.total).toBe(PRICE);
  });
});
