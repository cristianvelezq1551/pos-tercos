/**
 * E2E de nómina v2 (workers): períodos quincenales (4 sub-pagos/mes),
 * acumulación DAILY con overrides, MONTHLY prorrateado por días empleados,
 * novedades (bonos/descuentos), terminación, y control de pagos con
 * comprobante (Dueño + PIN, gate de fin de semana bypasseado por env).
 *
 * Usa el PRIMER sub-pago del MES ANTERIOR (días 1–7): siempre está cerrado
 * y completamente acumulado, sin importar cuándo corra la suite.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const PIN = '654321';
// PNG 1×1 válido (los comprobantes exigen imagen real por magic bytes).
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe('Nómina E2E (workers)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;

  let dailyId: string;
  let monthlyId: string;
  let exId: string;

  // Primer sub-pago (días 1–7) del mes anterior — siempre cerrado.
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const PERIOD = ymdUtc(periodStart);
  const dayInPeriod = (day: number): string =>
    ymdUtc(new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), day)));

  beforeAll(async () => {
    process.env.PAYROLL_PAYMENT_BYPASS_WEEKEND = '1';
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    const oldHire = new Date(Date.UTC(2026, 0, 1));

    const [, daily, monthly, ex] = await Promise.all([
      prisma.user.create({
        data: {
          email: 'dueno-pay@test.local',
          fullName: 'Dueño Nómina',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      }),
      prisma.user.create({
        data: {
          email: 'diario-pay@test.local',
          fullName: 'Trabajador Diario',
          role: 'TRABAJADOR',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
          payType: 'DAILY',
          salaryAmount: 50000,
          restDaysOfWeek: [],
          hireDate: oldHire,
        },
      }),
      prisma.user.create({
        data: {
          email: 'mensual-pay@test.local',
          fullName: 'Trabajador Mensual',
          role: 'TRABAJADOR',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
          payType: 'MONTHLY',
          salaryAmount: 2_800_000,
          restDaysOfWeek: [],
          // Ingresó el día 5 del período → empleado 3 de los 7 días (5, 6, 7).
          hireDate: new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 5)),
        },
      }),
      prisma.user.create({
        data: {
          email: 'ex-pay@test.local',
          fullName: 'Ex Trabajador',
          role: 'TRABAJADOR',
          passwordHash: hash,
          mustChangePwd: false,
          active: false,
          payType: 'DAILY',
          salaryAmount: 40000,
          restDaysOfWeek: [],
          hireDate: oldHire,
          // Salió ANTES del período → no debe aparecer en el reporte.
          terminationDate: new Date(periodStart.getTime() - 24 * 3600 * 1000),
        },
      }),
    ]);
    dailyId = daily.id;
    monthlyId = monthly.id;
    exId = ex.id;

    duenoToken = await loginAs(request, 'dueno-pay@test.local');
    await request
      .post('/approvals/pin')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ pin: PIN, password: 'dev12345' })
      .expect((r) => {
        if (r.status >= 300) throw new Error(`PIN setup: ${r.status}`);
      });
  });

  afterAll(async () => {
    delete process.env.PAYROLL_PAYMENT_BYPASS_WEEKEND;
    await cleanDb(prisma);
    await app.close();
  });

  it('DAILY acumula días × salario en el período (sin descansos configurados)', async () => {
    const res = await request
      .get(`/workers/period?start=${PERIOD}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(res.body.periodStart).toBe(PERIOD);
    expect(res.body.pago).toBe(1);
    expect(res.body.quincena).toBe(1);

    const daily = res.body.entries.find((e: { userId: string }) => e.userId === dailyId);
    expect(daily.daysWorked).toBe(7);
    expect(daily.base).toBe(350000); // 7 × 50.000
  });

  it('MONTHLY prorratea salario/4 por días empleados (ingreso a mitad del pago)', async () => {
    const res = await request
      .get(`/workers/period?start=${PERIOD}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const monthly = res.body.entries.find((e: { userId: string }) => e.userId === monthlyId);
    expect(monthly.daysEmployed).toBe(3);
    // 2.800.000/4 × 3/7 = 300.000
    expect(monthly.base).toBe(300000);
  });

  it('un trabajador terminado antes del período NO aparece en el reporte', async () => {
    const res = await request
      .get(`/workers/period?start=${PERIOD}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(res.body.entries.some((e: { userId: string }) => e.userId === exId)).toBe(false);
  });

  it('override de día (ausencia $0) y novedad (+bono) cambian la base y el total', async () => {
    // Ausencia el día 3 → 6 días × 50.000 = 300.000.
    await request
      .post(`/workers/${dailyId}/day`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', PIN)
      .send({ workDate: dayInPeriod(3), amount: 0, note: 'No vino' })
      .expect(201);
    // Bono +20.000 en el período.
    await request
      .post(`/workers/${dailyId}/adjustment`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', PIN)
      .send({ periodStart: PERIOD, concept: 'Bono aseo', amount: 20000 })
      .expect(201);

    const res = await request
      .get(`/workers/period?start=${PERIOD}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const daily = res.body.entries.find((e: { userId: string }) => e.userId === dailyId);
    expect(daily.base).toBe(300000);
    expect(daily.daysWorked).toBe(6);
    expect(daily.adjustmentsTotal).toBe(20000);
    expect(daily.total).toBe(320000);
  });

  it('las escrituras de nómina exigen PIN válido', async () => {
    await request
      .post(`/workers/${dailyId}/day`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', '000000')
      .send({ workDate: dayInPeriod(4), amount: 0 })
      .expect(403);
  });

  it('marcar PAGADO snapshotea el total con comprobante; queda visible en el período', async () => {
    const res = await request
      .post(`/workers/${dailyId}/payment/paid`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', PIN)
      .field('periodStart', PERIOD)
      .field('note', 'Nequi')
      .attach('proof', PNG_1PX, 'comprobante.png')
      .expect(201);
    expect(res.body.status).toBe('PAID');
    expect(res.body.amount).toBe(320000); // snapshot base + bono
    const paymentId = res.body.id as string;

    const period = await request
      .get(`/workers/period?start=${PERIOD}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const daily = period.body.entries.find((e: { userId: string }) => e.userId === dailyId);
    expect(daily.payment?.status).toBe('PAID');

    // Comprobante recuperable como binario.
    const proof = await request
      .get(`/workers/payment/${paymentId}/proof`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(proof.headers['content-type']).toContain('image/png');
  });

  it('no se puede marcar pagado un período que todavía no termina', async () => {
    // Un período claramente FUTURO (2 meses adelante): su cierre nunca llegó →
    // siempre 400. Robusto a la fecha: usar "hoy" fallaba en el ÚLTIMO día de
    // un sub-pago (ese día el período ya está cerrado).
    const now = new Date();
    const future = ymdUtc(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1)));
    await request
      .post(`/workers/${dailyId}/payment/paid`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', PIN)
      .field('periodStart', future)
      .attach('proof', PNG_1PX, 'comprobante.png')
      .expect(400);
  });

  it('desmarcar el pago lo elimina (y es idempotente)', async () => {
    await request
      .delete(`/workers/${dailyId}/payment?period=${PERIOD}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', PIN)
      .expect(200);
    const period = await request
      .get(`/workers/period?start=${PERIOD}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const daily = period.body.entries.find((e: { userId: string }) => e.userId === dailyId);
    expect(daily.payment).toBeNull();
    // Segunda vez: no explota.
    await request
      .delete(`/workers/${dailyId}/payment?period=${PERIOD}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('X-Approval-Pin', PIN)
      .expect(200);
  });

  it('el panel mensual del empleado DAILY trae los 4 sub-pagos y el calendario', async () => {
    const res = await request
      .get(
        `/workers/panel/${dailyId}?year=${periodStart.getUTCFullYear()}&month=${periodStart.getUTCMonth() + 1}`,
      )
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(res.body.quincenas).toHaveLength(2);
    const totalPagos = res.body.quincenas.reduce(
      (acc: number, q: { pagos: unknown[] }) => acc + q.pagos.length,
      0,
    );
    expect(totalPagos).toBe(4);
    const absent = res.body.days.find((d: { workDate: string }) => d.workDate === dayInPeriod(3));
    expect(absent.amount).toBe(0);
    expect(absent.isAbsence).toBe(true);
  });
});
