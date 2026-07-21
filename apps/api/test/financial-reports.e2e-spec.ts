/**
 * §4.6: los reportes financieros del dueño (`/reports/financial/monthly`,
 * `/reports/dashboard`) no tenían asserts de MONTOS — el dueño decide con
 * números que nadie verificaba. Cubre por DELTA (robusto a datos previos): una
 * venta conocida mueve revenue y COGS lo esperado, y el estado financiero expone
 * las líneas de Fase 1 (wasteCost restado del neto, cogsEstimated).
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Reportes financieros del dueño E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let productId: string;
  let cogs: CogsService;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const now = new Date();

  const monthly = async () => {
    // El ledger FIFO tiene caché TTL 60s (staleness deliberada de los reportes).
    // En el test invalidamos para leer FRESCO tras cada movimiento — igual que
    // ledger-snapshot.e2e; en prod lo refresca el cron/snapshot o el paso del TTL.
    cogs.invalidateLedgerCache();
    return (await request.get(`/reports/financial/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).set(auth()).expect(200))
      .body as { revenue: number; cogs: number; netResult: number; wasteCost: number; cogsEstimated: boolean; cogsPartial: boolean };
  };

  const dashboardRevenue = async () =>
    (await request.get('/reports/dashboard').set(auth()).expect(200)).body.todayRevenue as number;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    cogs = app.get(CogsService);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'dueno-fr@test.local', fullName: 'Dueño FR', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    token = await loginAs(request, 'dueno-fr@test.local');
    const prod = await request
      .post('/products')
      .set(auth())
      .send({ name: 'Coca FR', basePrice: 5000, directResale: true, unitPurchase: 'caja', unitStock: 'unit', conversionFactor: 24, modifiersEnabled: false })
      .expect(201);
    productId = prod.body.id as string;
    // Stock con costo FIFO conocido: 10 unidades a $1.500 c/u.
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: 10, type: 'INITIAL', unitCost: 1500 })
      .expect(201);
    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('una venta conocida mueve revenue (+$5.000) y COGS (+$1.500) en el P&G del mes y el dashboard', async () => {
    const mBefore = await monthly();
    const dashBefore = await dashboardRevenue();

    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
      .expect(201);
    await request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: 5000 })
      .expect(201);

    const mAfter = await monthly();
    expect(mAfter.revenue - mBefore.revenue).toBe(5000);
    // COGS FIFO de la unidad vendida: $1.500.
    expect(mAfter.cogs - mBefore.cogs).toBe(1500);
    // El neto sube en (revenue − cogs) por esta venta (sin otros gastos nuevos).
    expect(mAfter.netResult - mBefore.netResult).toBe(5000 - 1500);
    expect(await dashboardRevenue() - dashBefore).toBe(5000);

    // §1.2/§1.12: las líneas nuevas del estado financiero están presentes.
    expect(typeof mAfter.wasteCost).toBe('number');
    expect(typeof mAfter.cogsEstimated).toBe('boolean');
  });

  it('la merma se resta del neto (§1.2) sin tocar el revenue', async () => {
    const before = await monthly();
    // Merma de 2 unidades a $1.500 = $3.000 (WASTE).
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: -2, type: 'WASTE', notes: 'se cayó la caja' })
      .expect(201);
    const after = await monthly();

    expect(after.revenue).toBe(before.revenue); // la merma NO es ingreso
    expect(after.wasteCost - before.wasteCost).toBe(3000);
    // El neto BAJA por la merma (decisión del dueño: la merma resta).
    expect(after.netResult - before.netResult).toBe(-3000);
  });
});
