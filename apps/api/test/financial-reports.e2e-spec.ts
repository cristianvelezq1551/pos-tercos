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
      .body as {
      revenue: number; cogs: number; grossMargin: number; grossMarginPct: number;
      netResult: number; wasteCost: number; cortesiasCost: number; refundCost: number;
      totalFixed: number; oneTimeCost: number; breakEven: number | null;
      fixedCosts: Array<{ name: string; monthlyAmount: number; isPayroll: boolean; isOneTime: boolean }>;
      cogsEstimated: boolean; cogsPartial: boolean;
    };
  };

  const dashboardRevenue = async () =>
    (await request.get('/reports/dashboard').set(auth()).expect(200)).body.todayRevenue as number;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Auto-aislada: no confiar en que la suite anterior limpió. Esta suite lee
    // agregados GLOBALES (reportes / ledger de inventario), así que un residuo
    // de otra suite mueve los números y el fallo depende del orden de archivos.
    await cleanDb(prisma);
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
  it('anular una merma mal registrada la borra del neto (queda solo lo que se tiró)', async () => {
    const before = await monthly();
    // El cocinero teclea 4 unidades cuando en realidad se cayó 1.
    const merma = await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: -4, type: 'WASTE', notes: 'dedo pesado' })
      .expect(201);
    const conMerma = await monthly();
    expect(conMerma.wasteCost - before.wasteCost).toBe(6000); // 4 × $1.500

    // El dueño devuelve las 3 que nunca se tiraron.
    await request
      .post(`/inventory/movements/${merma.body.id}/reverse-waste`)
      .set(auth())
      .send({ reason: 'Fue una unidad, no cuatro', quantity: 3 })
      .expect(201);

    const after = await monthly();
    // Pérdida real: 1 × $1.500. Sin la reversa, el P&G arrastraba $6.000 para siempre.
    expect(after.wasteCost - before.wasteCost).toBe(1500);
    expect(after.netResult - before.netResult).toBe(-1500);
    expect(after.revenue).toBe(before.revenue);
  });

  it('un salario MENSUAL entra completo como "Nómina (auto)" y baja el neto', async () => {
    const before = await monthly();
    const SALARIO = 3_000_000;
    // Contratado antes del mes y sin salida ⇒ el mes se devenga entero.
    await prisma.user.create({
      data: {
        email: 'mensual-fr@test.local',
        fullName: 'Empleado Mensual',
        role: 'TRABAJADOR',
        passwordHash: 'x',
        mustChangePwd: false,
        active: true,
        payType: 'MONTHLY',
        salaryAmount: SALARIO,
        hireDate: new Date(Date.UTC(now.getFullYear() - 1, 0, 1)),
      },
    });

    const after = await monthly();
    // Suma exacta del salario: el prorrateo por día debe cerrar en el mes completo,
    // sea de 28, 30 o 31 días.
    expect(after.totalFixed - before.totalFixed).toBe(SALARIO);
    expect(after.netResult - before.netResult).toBe(-SALARIO);
    const nomina = after.fixedCosts.find((l) => l.isPayroll);
    expect(nomina?.monthlyAmount).toBe(SALARIO);
  });

  it('un empleado que se fue antes del mes NO devenga nada', async () => {
    const before = await monthly();
    await prisma.user.create({
      data: {
        email: 'retirado-fr@test.local',
        fullName: 'Ya no trabaja acá',
        role: 'TRABAJADOR',
        passwordHash: 'x',
        mustChangePwd: false,
        active: false,
        payType: 'MONTHLY',
        salaryAmount: 2_000_000,
        hireDate: new Date(Date.UTC(now.getFullYear() - 2, 0, 1)),
        terminationDate: new Date(Date.UTC(now.getFullYear() - 1, 0, 31)),
      },
    });
    const after = await monthly();
    expect(after.totalFixed).toBe(before.totalFixed);
    expect(after.netResult).toBe(before.netResult);
  });

  it('un costo fijo recurrente baja el neto y entra al break-even; uno puntual NO', async () => {
    const before = await monthly();
    const ARRIENDO = 1_500_000;
    await request
      .post('/fixed-costs')
      .set(auth())
      .send({ name: 'Arriendo', amount: ARRIENDO, frequency: 'MONTHLY', category: 'Local' })
      .expect(201);

    const conArriendo = await monthly();
    expect(conArriendo.totalFixed - before.totalFixed).toBe(ARRIENDO);
    expect(conArriendo.netResult - before.netResult).toBe(-ARRIENDO);

    // Gasto puntual: pega al neto pero se reporta aparte y NO infla el
    // break-even (que representa el piso RECURRENTE que hay que vender).
    const COMPRA_HORNO = 800_000;
    const hoy = new Date().toISOString().slice(0, 10);
    await request
      .post('/fixed-costs')
      .set(auth())
      .send({ name: 'Horno nuevo', amount: COMPRA_HORNO, frequency: 'ONE_TIME', category: 'Equipos', startedAt: hoy })
      .expect(201);

    const after = await monthly();
    expect(after.oneTimeCost - conArriendo.oneTimeCost).toBe(COMPRA_HORNO);
    expect(after.totalFixed).toBe(conArriendo.totalFixed); // el puntual NO es recurrente
    expect(after.netResult - conArriendo.netResult).toBe(-COMPRA_HORNO);

    // Break-even = costos recurrentes / margen bruto %.
    if (after.grossMarginPct > 0) {
      expect(after.breakEven).toBeCloseTo(after.totalFixed / after.grossMarginPct, 0);
    }
  });

  it('el estado financiero cierra: neto = margen bruto − fijos − puntuales − cortesías − reembolsos − merma', async () => {
    const m = await monthly();
    expect(m.grossMargin).toBeCloseTo(m.revenue - m.cogs, 2);
    const esperado =
      m.grossMargin - m.totalFixed - m.oneTimeCost - m.cortesiasCost - m.refundCost - m.wasteCost;
    // Es LA identidad del reporte: si esto se rompe, el dueño decide con un
    // número que no corresponde a ninguna suma.
    expect(m.netResult).toBeCloseTo(esperado, 2);
  });
});
