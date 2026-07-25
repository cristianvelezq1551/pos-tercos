/**
 * receipt-integrity.e2e-spec.ts
 *
 * La numeración de recibos es el control antifraude más barato que tiene el
 * negocio: si faltan números en la secuencia, o una venta se cayó a mitad de
 * creación, o alguien borró filas. El detector corre solo a las 4 AM y el
 * dueño lo puede disparar a mano.
 *
 * Nunca se había probado que DETECTE el salto — solo que el endpoint respondía.
 */

import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

type GapReport = {
  totalSales: number;
  minReceipt: number | null;
  maxReceipt: number | null;
  gap: number;
};

describe('Integridad de la numeración de recibos E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cajeroToken: string;
  let productId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const check = async (): Promise<GapReport> =>
    (await request.post('/sales/admin/check-receipt-gaps').set(auth(duenoToken)).expect(201))
      .body as GapReport;

  const sell = async (): Promise<string> => {
    const res = await request
      .post('/sales')
      .set(auth(duenoToken))
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
      .expect(201);
    return (res.body as { id: string }).id;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Auto-aislada: el reporte mira TODAS las ventas de la base.
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-recibos@test.local', fullName: 'Dueño Recibos', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-recibos@test.local', fullName: 'Cajero Recibos', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
    });
    duenoToken = await loginAs(request, 'dueno-recibos@test.local');
    cajeroToken = await loginAs(request, 'cajero-recibos@test.local');

    const prod = await request
      .post('/products')
      .set(auth(duenoToken))
      .send({
        name: 'Gaseosa Recibos',
        basePrice: 4000,
        directResale: true,
        unitPurchase: 'caja',
        unitStock: 'unidad',
        conversionFactor: 24,
        modifiersEnabled: false,
      })
      .expect(201);
    productId = (prod.body as { id: string }).id;
    await request.post('/shifts/open').set(auth(duenoToken)).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('con la numeración corrida no reporta ningún salto', async () => {
    await sell();
    await sell();
    await sell();

    const r = await check();
    expect(r.totalSales).toBe(3);
    expect(r.gap).toBe(0);
    expect(r.maxReceipt! - r.minReceipt!).toBe(2);
  });

  it('detecta el hueco que deja una venta abortada a mitad de creación', async () => {
    const antes = await check();
    expect(antes.gap).toBe(0);

    // El escenario REAL que el detector persigue: Postgres entrega un
    // receipt_number y la transacción se cae después (CHECK violado, corte de
    // red). La secuencia ya avanzó, pero no hay fila. Se reproduce consumiendo
    // el número a mano — nada de borrar ventas: `sale_status_log` es
    // insert-only por trigger y la base lo rechaza (§4.4).
    await prisma.$queryRaw`SELECT nextval('receipt_seq')`;
    await sell();

    const despues = await check();
    expect(despues.gap).toBe(1);
    expect(despues.totalSales).toBe(antes.totalSales + 1);
  });

  it('deja el salto en la bitácora para que el dueño pueda investigarlo', async () => {
    await check();
    const log = await prisma.auditLog.findFirst({
      where: { action: 'RECEIPT_GAP_DETECTED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log!.metadata)).toContain('gap');
  });

  it('es del dueño: el cajero no puede correr el chequeo', async () => {
    await request
      .post('/sales/admin/check-receipt-gaps')
      .set(auth(cajeroToken))
      .expect(403);
  });

  it('sin ventas no inventa un salto (base recién creada)', async () => {
    // TRUNCATE, no DELETE: el trigger insert-only rechaza el borrado fila a fila.
    await cleanDb(prisma);

    const r = await check();
    expect(r.totalSales).toBe(0);
    expect(r.gap).toBe(0);
    expect(r.minReceipt).toBeNull();
    expect(r.maxReceipt).toBeNull();
  });
});
