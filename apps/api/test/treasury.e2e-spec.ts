/**
 * treasury.e2e-spec.ts
 *
 * Tesorería de dos bolsillos (Efectivo / Cuenta): config inicial, traspasos,
 * ajustes con signo, anulación y el cálculo del saldo (summary). Cubre la
 * lógica financiera que el dueño usa para saber con cuánta plata cuenta.
 *
 * Las aserciones de saldo se hacen por DELTA entre dos lecturas que envuelven
 * cada acción: el summary agrega toda la base, así que comparar absolutos sería
 * frágil ante cualquier dato residual. Los deltas miden solo el efecto real.
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

interface Pocket {
  initial: number;
  transfersIn: number;
  transfersOut: number;
  adjustments: number;
  balance: number;
}
interface Summary {
  cash: Pocket;
  bank: Pocket;
  total: number;
}

describe('Treasury E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const summary = async (): Promise<Summary> => {
    const res = await request.get('/treasury/summary').set(auth(duenoToken)).expect(200);
    return res.body as Summary;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-treasury@test.local', fullName: 'Dueño Treasury', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-treasury@test.local', fullName: 'Cajero Treasury', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-treasury@test.local');
    cajeroToken = await loginAs(request, 'cajero-treasury@test.local');

    // Config inicial fija para toda la suite.
    await request
      .patch('/treasury/config')
      .set(auth(duenoToken))
      .send({ anchorDate: null, initialCash: 100_000, initialBank: 50_000 })
      .expect(200);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('rechaza acceso a un rol no-dueño (403)', async () => {
    await request.get('/treasury/summary').set(auth(cajeroToken)).expect(403);
  });

  it('la config inicial se refleja en initial de cada bolsillo', async () => {
    const res = await request.get('/treasury/config').set(auth(duenoToken)).expect(200);
    expect(res.body).toEqual({ anchorDate: null, initialCash: 100_000, initialBank: 50_000 });
    const s = await summary();
    expect(s.cash.initial).toBe(100_000);
    expect(s.bank.initial).toBe(50_000);
  });

  it('rechaza un traspaso con mismo origen y destino (400)', async () => {
    await request
      .post('/treasury/transfer')
      .set(auth(duenoToken))
      .send({ fromPocket: 'EFECTIVO', toPocket: 'EFECTIVO', amount: 10_000, reason: 'mismo bolsillo' })
      .expect(400);
  });

  it('un traspaso Efectivo→Cuenta mueve saldo sin cambiar el total', async () => {
    const before = await summary();
    await request
      .post('/treasury/transfer')
      .set(auth(duenoToken))
      .send({ fromPocket: 'EFECTIVO', toPocket: 'CUENTA', amount: 30_000, reason: 'consignación' })
      .expect(201);
    const after = await summary();

    expect(after.cash.transfersOut - before.cash.transfersOut).toBe(30_000);
    expect(after.bank.transfersIn - before.bank.transfersIn).toBe(30_000);
    expect(after.cash.balance - before.cash.balance).toBe(-30_000);
    expect(after.bank.balance - before.bank.balance).toBe(30_000);
    expect(after.total - before.total).toBe(0); // un traspaso no crea ni destruye plata
  });

  it('un ajuste negativo en Efectivo baja el saldo y el total', async () => {
    const before = await summary();
    await request
      .post('/treasury/adjustment')
      .set(auth(duenoToken))
      .send({ pocket: 'EFECTIVO', amount: -5_000, reason: 'faltante de caja' })
      .expect(201);
    const after = await summary();

    expect(after.cash.adjustments - before.cash.adjustments).toBe(-5_000);
    expect(after.cash.balance - before.cash.balance).toBe(-5_000);
    expect(after.total - before.total).toBe(-5_000);
  });

  it('rechaza un ajuste de monto 0 (400)', async () => {
    await request
      .post('/treasury/adjustment')
      .set(auth(duenoToken))
      .send({ pocket: 'CUENTA', amount: 0, reason: 'nada' })
      .expect(400);
  });

  it('anular un movimiento revierte exactamente su efecto en el saldo', async () => {
    const before = await summary();
    const created = await request
      .post('/treasury/adjustment')
      .set(auth(duenoToken))
      .send({ pocket: 'CUENTA', amount: 12_345, reason: 'ajuste a anular' })
      .expect(201);
    const movementId = created.body.id as string;

    const withAdj = await summary();
    expect(withAdj.bank.adjustments - before.bank.adjustments).toBe(12_345);

    await request.post(`/treasury/movements/${movementId}/void`).set(auth(duenoToken)).expect(201);

    const after = await summary();
    expect(after.bank.adjustments).toBe(before.bank.adjustments); // el anulado ya no cuenta
    expect(after.bank.balance).toBe(before.bank.balance); // vuelve al saldo previo

    // El movimiento queda marcado VOIDED, no borrado (auditable).
    const list = await request.get('/treasury/movements').set(auth(duenoToken)).expect(200);
    const voided = (list.body as Array<{ id: string; status: string }>).find((m) => m.id === movementId);
    expect(voided?.status).toBe('VOIDED');
  });

  it('anular dos veces es idempotente (no rompe)', async () => {
    const created = await request
      .post('/treasury/adjustment')
      .set(auth(duenoToken))
      .send({ pocket: 'EFECTIVO', amount: 1_000, reason: 'doble anulación' })
      .expect(201);
    const id = created.body.id as string;
    await request.post(`/treasury/movements/${id}/void`).set(auth(duenoToken)).expect(201);
    await request.post(`/treasury/movements/${id}/void`).set(auth(duenoToken)).expect(201);
  });
});
