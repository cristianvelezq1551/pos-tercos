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
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

interface Pocket {
  initial: number;
  income: number;
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

  it('anchor-date es AdminAccess (sin saldos) pero sigue vedado al cajero', async () => {
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [{ email: 'admin-treasury@test.local', fullName: 'Admin Treasury', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true }],
      skipDuplicates: true,
    });
    const adminToken = await loginAs(request, 'admin-treasury@test.local');

    const res = await request.get('/treasury/anchor-date').set(auth(adminToken)).expect(200);
    expect(res.body).toEqual({ anchorDate: null });
    // Solo expone la fecha: el resto de tesorería sigue siendo Dueño-only.
    await request.get('/treasury/summary').set(auth(adminToken)).expect(403);
    await request.get('/treasury/anchor-date').set(auth(cajeroToken)).expect(403);
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

  it('idempotencia: dos transfers con la misma key NO duplican el movimiento', async () => {
    const key = randomUUID();
    const body = { fromPocket: 'EFECTIVO', toPocket: 'CUENTA', amount: 1_234, reason: 'idem-transfer-test' };
    const a = await request.post('/treasury/transfer').set(auth(duenoToken)).set('Idempotency-Key', key).send(body).expect(201);
    const b = await request.post('/treasury/transfer').set(auth(duenoToken)).set('Idempotency-Key', key).send(body).expect(201);
    expect(b.body.id).toBe(a.body.id); // misma respuesta cacheada (no un 2do movimiento)
    const movs = await prisma.treasuryMovement.findMany({ where: { reason: 'idem-transfer-test' } });
    expect(movs).toHaveLength(1);
  });

  it('la DB rechaza un bolsillo/estado fuera del enum (garantía nativa)', async () => {
    const created = await request
      .post('/treasury/adjustment')
      .set(auth(duenoToken))
      .send({ pocket: 'EFECTIVO', amount: 100, reason: 'enum-test' })
      .expect(201);
    const id = created.body.id as string;
    await expect(
      prisma.$executeRawUnsafe(`UPDATE treasury_movements SET pocket = 'BILLETERA' WHERE id = '${id}'`),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(`UPDATE treasury_movements SET status = 'BORRADO' WHERE id = '${id}'`),
    ).rejects.toThrow();
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

  it('creación concurrente del singleton de config no revienta (P2002 race)', async () => {
    // Regresión: la página de tesorería pide /config y /summary en paralelo;
    // con la tabla vacía, ambos upserts intentaban CREAR el singleton a la vez
    // y el perdedor devolvía 500 (P2002). El perdedor debe releer y responder 200.
    await prisma.treasuryConfig.deleteMany();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request.get('/treasury/config').set(auth(duenoToken)),
      ),
    );
    for (const r of results) expect(r.status).toBe(200);
    expect(await prisma.treasuryConfig.count()).toBe(1);
    // Restaurar la config fija de la suite (el singleton recreado queda en 0).
    await request
      .patch('/treasury/config')
      .set(auth(duenoToken))
      .send({ anchorDate: null, initialCash: 100_000, initialBank: 50_000 })
      .expect(200);
  });

  it('el ingreso por ventas entra NETO del envío (§7.v30): el domicilio no infla el bolsillo', async () => {
    // Bug: el summary sumaba el pago BRUTO — cada domicilio inflaba el bolsillo Efectivo con un envío que es plata del repartidor.
    const before = await summary();

    // Domicilio cobrado en CASH: $38.000 de comida + $7.000 de envío = $45.000.
    // Venta+pago directo por prisma: lo que se prueba es la lectura del summary,
    // no el flujo de cobro (ese vive en web-delivery.e2e-spec).
    await prisma.sale.create({
      data: {
        type: 'WEB_DELIVERY',
        status: 'PAGADO',
        subtotal: 38_000,
        total: 45_000, // CHECK: total = subtotal − descuento + delivery_fee
        deliveryFee: 7_000,
        deliveryAddress: 'Cra 43A #5-15, torre 2, apto 502',
        customerName: 'Cliente Domicilio Treasury',
        customerPhone: '+573001234567',
        paidAt: new Date(),
        paymentMethod: 'CASH',
        payments: {
          create: [{ method: 'CASH', amount: 45_000, amountReceived: 45_000 }],
        },
      },
    });

    const after = await summary();
    // Solo la comida es del negocio: $38.000, no los $45.000 que entraron.
    expect(after.cash.income - before.cash.income).toBe(38_000);
    expect(after.cash.balance - before.cash.balance).toBe(38_000);
    expect(after.bank.income).toBe(before.bank.income); // el pago fue CASH: la cuenta no se mueve
  });

  it('un costo fijo sin responsable se atribuye a su CATEGORÍA (no "Sin asignar")', async () => {
    const n = new Date();
    const todayYmd = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const created = await request
      .post('/fixed-costs')
      .set(auth(duenoToken))
      .send({ name: 'Arriendo bodega test', amount: 77_777, frequency: 'ONE_TIME', category: 'AlquilerTest', startedAt: todayYmd })
      .expect(201);

    const res = await request.get('/treasury/summary').set(auth(duenoToken)).expect(200);
    const rows = res.body.commitmentsByResponsible as Array<{ responsible: string; total: number }>;
    const cat = rows.find((r) => r.responsible === 'AlquilerTest');
    expect(cat).toBeDefined();
    expect(cat!.total).toBe(77_777);

    await request.delete(`/fixed-costs/${created.body.id as string}`).set(auth(duenoToken)).expect(204);
  });
});
