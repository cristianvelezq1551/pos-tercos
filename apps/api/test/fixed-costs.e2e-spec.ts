/**
 * fixed-costs.e2e-spec.ts
 *
 * Costos fijos del negocio: CRUD, marcar pagado un período (requiere PIN +
 * comprobante, reparto por bolsillo) y que ese pago se refleje como gasto en la
 * Tesorería. Dueño-only.
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

// 1×1 PNG válido (magic bytes correctos para detectImageMimeLoose).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/an3AAAAAElFTkSuQmCC',
  'base64',
);
const PIN = '424242';

describe('Fixed Costs E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createCost = async (amount: number, name = 'Arriendo') => {
    const res = await request
      .post('/fixed-costs')
      .set(auth(duenoToken))
      .send({ name, amount, frequency: 'MONTHLY', category: 'Local' })
      .expect(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-fc@test.local', fullName: 'Dueño FC', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-fc@test.local', fullName: 'Cajero FC', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-fc@test.local');
    cajeroToken = await loginAs(request, 'cajero-fc@test.local');

    // PIN de aprobación del dueño (lo exige marcar pagado).
    await request
      .post('/approvals/pin')
      .set(auth(duenoToken))
      .send({ pin: PIN, password: 'dev12345' })
      .expect((res) => {
        if (res.status >= 300) throw new Error(`PIN setup falló: ${res.status} ${JSON.stringify(res.body)}`);
      });
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('rechaza acceso a un rol no-dueño (403)', async () => {
    await request.get('/fixed-costs').set(auth(cajeroToken)).expect(403);
  });

  it('crea, lista y lee un costo fijo', async () => {
    const id = await createCost(800_000, 'Arriendo local');
    const list = await request.get('/fixed-costs').set(auth(duenoToken)).expect(200);
    expect((list.body as Array<{ id: string }>).some((c) => c.id === id)).toBe(true);

    const one = await request.get(`/fixed-costs/${id}`).set(auth(duenoToken)).expect(200);
    expect(one.body.name).toBe('Arriendo local');
    expect(one.body.amount).toBe(800_000);
  });

  it('actualiza un costo fijo', async () => {
    const id = await createCost(500_000, 'Internet');
    const res = await request
      .patch(`/fixed-costs/${id}`)
      .set(auth(duenoToken))
      .send({ amount: 550_000 })
      .expect(200);
    expect(res.body.amount).toBe(550_000);
  });

  it('elimina un costo fijo (204)', async () => {
    const id = await createCost(120_000, 'Servicio a borrar');
    await request.delete(`/fixed-costs/${id}`).set(auth(duenoToken)).expect(204);
  });

  it('marcar pagado sin PIN es rechazado (400)', async () => {
    const id = await createCost(300_000, 'Luz');
    await request
      .post(`/fixed-costs/${id}/payment`)
      .set(auth(duenoToken))
      .field('periodYear', '2026')
      .field('periodMonth', '6')
      .field('amount', '300000')
      .field('cashAmount', '0')
      .field('bankAmount', '300000')
      .attach('proof', PNG_1X1, 'proof.png')
      .expect(400);
  });

  it('marca pagado con PIN + comprobante y se refleja como gasto en Tesorería', async () => {
    await request
      .patch('/treasury/config')
      .set(auth(duenoToken))
      .send({ anchorDate: null, initialCash: 0, initialBank: 1_000_000 })
      .expect(200);

    const before = await request.get('/treasury/summary').set(auth(duenoToken)).expect(200);
    const bankExpBefore = before.body.bank.expensesPaid as number;

    const id = await createCost(300_000, 'Agua');
    const paid = await request
      .post(`/fixed-costs/${id}/payment`)
      .set(auth(duenoToken))
      .set('X-Approval-Pin', PIN)
      .field('periodYear', '2026')
      .field('periodMonth', '6')
      .field('amount', '300000')
      .field('cashAmount', '0')
      .field('bankAmount', '300000')
      .attach('proof', PNG_1X1, 'proof.png')
      .expect(201);
    expect(paid.body).toBeDefined();

    const after = await request.get('/treasury/summary').set(auth(duenoToken)).expect(200);
    expect(after.body.bank.expensesPaid).toBe(bankExpBefore + 300_000);
  });
});
