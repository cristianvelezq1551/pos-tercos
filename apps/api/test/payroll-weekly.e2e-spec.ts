/**
 * E2E de la nómina SEMANAL unificada (v7): MENSUALES y DIARIOS aparecen en la
 * misma semana; los ajustes (bono/descuento) anclados a la semana mueven el neto.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import type { WeeklyPayrollReport } from '@pos-tercos/types';

describe('Nómina semanal unificada E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let monthlyId: string;
  let dailyId: string;

  // Semana fija en el pasado (no-futuro) para que owed sea estable.
  const WEEK = '2026-05-13'; // miércoles

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    const oldHire = new Date(Date.UTC(2020, 0, 1));
    const [, mUser, dUser] = await Promise.all([
      prisma.user.create({
        data: { email: 'dueno-wk@test.local', fullName: 'Dueño WK', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
      }),
      prisma.user.create({
        data: {
          email: 'mensual-wk@test.local', fullName: 'Ana Mensual', role: 'TRABAJADOR',
          passwordHash: hash, mustChangePwd: false, active: true,
          payType: 'MONTHLY', salaryAmount: 3_000_000, hireDate: oldHire,
        },
      }),
      prisma.user.create({
        data: {
          email: 'diario-wk@test.local', fullName: 'Luis Diario', role: 'TRABAJADOR',
          passwordHash: hash, mustChangePwd: false, active: true,
          payType: 'DAILY', salaryAmount: 60_000, hireDate: oldHire,
        },
      }),
    ]);
    monthlyId = mUser.id;
    dailyId = dUser.id;
    token = await loginAs(request, 'dueno-wk@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const getWeek = async (): Promise<WeeklyPayrollReport> => {
    const res = await request.get(`/workers/weekly?week=${WEEK}`).set('Authorization', `Bearer ${token}`).expect(200);
    return res.body as WeeklyPayrollReport;
  };

  it('MENSUAL y DIARIO aparecen en la misma semana, ambos con monto', async () => {
    const wk = await getWeek();
    const ana = wk.entries.find((e) => e.userId === monthlyId);
    const luis = wk.entries.find((e) => e.userId === dailyId);
    expect(ana).toBeDefined();
    expect(luis).toBeDefined();
    expect(ana!.payType).toBe('MONTHLY');
    expect(luis!.payType).toBe('DAILY');
    // MENSUAL: salario/díasDelMes × días empleados de la semana → > 0.
    expect(ana!.owedTotal).toBeGreaterThan(0);
    expect(luis!.owedTotal).toBeGreaterThan(0);
    // Sin ajustes ni abonos: neto = owed, restante = neto.
    expect(ana!.netOwed).toBe(ana!.owedTotal);
    expect(ana!.remaining).toBe(ana!.netOwed);
  });

  it('un bono de la semana sube el neto y el restante del empleado', async () => {
    const wk = await getWeek();
    const before = wk.entries.find((e) => e.userId === dailyId)!;

    await request
      .post('/workers/weekly/adjustment')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: dailyId, weekStart: wk.weekStart, concept: 'Bono', amount: 50_000 })
      .expect(201);

    const after = (await getWeek()).entries.find((e) => e.userId === dailyId)!;
    expect(after.adjustments).toHaveLength(1);
    expect(after.adjustmentsTotal).toBe(50_000);
    expect(after.netOwed).toBe(before.owedTotal + 50_000);
    expect(after.remaining).toBe(after.netOwed);
  });

  it('un descuento baja el neto; eliminar el ajuste lo revierte', async () => {
    const wk = await getWeek();
    const adjRes = await request
      .post('/workers/weekly/adjustment')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: monthlyId, weekStart: wk.weekStart, concept: 'Descuento', amount: -30_000 })
      .expect(201);
    const adjId = adjRes.body.id as string;

    const withDisc = (await getWeek()).entries.find((e) => e.userId === monthlyId)!;
    expect(withDisc.adjustmentsTotal).toBe(-30_000);
    expect(withDisc.netOwed).toBe(withDisc.owedTotal - 30_000);

    await request.delete(`/workers/weekly/adjustment/${adjId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const reverted = (await getWeek()).entries.find((e) => e.userId === monthlyId)!;
    expect(reverted.adjustments).toHaveLength(0);
    expect(reverted.netOwed).toBe(reverted.owedTotal);
  });

  it('un abono semanal aparece en /finanzas (paidPayroll) y baja el pendiente del cash-flow', async () => {
    // /finanzas ahora lee los abonos SEMANALES (payrollWeekPayment), no las
    // quincenas. El abono se paga 100% por cuenta (sin caja abierta).
    await request
      .post('/approvals/pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '135790', password: 'dev12345' })
      .expect((res) => {
        if (res.status >= 300) throw new Error(`PIN setup falló: ${res.status} ${JSON.stringify(res.body)}`);
      });

    const wk = await getWeek();
    // El abono cae con paidAt = ahora → consultamos /finanzas del mes actual.
    const now = new Date();
    const ym = `year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;
    const pendingOf = (body: { pendingPayroll: Array<{ userId: string; total: number }> }): number =>
      body.pendingPayroll.filter((p) => p.userId === dailyId).reduce((a, p) => a + p.total, 0);

    const before = await request.get(`/reports/finance-summary?${ym}`).set('Authorization', `Bearer ${token}`).expect(200);
    const pendingBefore = pendingOf(before.body);

    const ABONO = 60_000;
    // 1×1 PNG válido (magic bytes correctos para detectImageMimeLoose).
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/an3AAAAAElFTkSuQmCC',
      'base64',
    );
    const payRes = await request
      .post('/workers/weekly/pay')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Approval-Pin', '135790')
      .field('payload', JSON.stringify({ userId: dailyId, weekStart: wk.weekStart, days: [], cashAmount: 0, bankAmount: ABONO }))
      .attach('proof', png, 'proof.png')
      .expect(201);
    expect(payRes.body.amount).toBe(ABONO);

    const after = await request.get(`/reports/finance-summary?${ym}`).set('Authorization', `Bearer ${token}`).expect(200);
    const paid = (after.body.paidPayroll as Array<{ userId: string; amount: number }>).filter((p) => p.userId === dailyId);
    expect(paid.some((p) => p.amount === ABONO)).toBe(true);
    // La semana pagada baja su restante → el pendiente del cash-flow cae el abono.
    expect(pendingOf(after.body)).toBe(pendingBefore - ABONO);
  });

  it('rechaza un abono que supera lo que falta de la semana (anti doble-abono)', async () => {
    await request
      .post('/approvals/pin')
      .set('Authorization', `Bearer ${token}`)
      .send({ pin: '135790', password: 'dev12345' })
      .expect((r) => {
        if (r.status >= 300) throw new Error(`PIN: ${r.status}`);
      });
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/an3AAAAAElFTkSuQmCC',
      'base64',
    );
    const wk = await getWeek();
    const luis = wk.entries.find((e) => e.userId === dailyId)!;
    // Pagar TODO lo que falta (banco, sin caja).
    if (luis.remaining > 0) {
      await request
        .post('/workers/weekly/pay')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Approval-Pin', '135790')
        .field('payload', JSON.stringify({ userId: dailyId, weekStart: wk.weekStart, days: [], cashAmount: 0, bankAmount: luis.remaining }))
        .attach('proof', png, 'p.png')
        .expect(201);
    }
    // Un abono adicional sobre una semana ya saldada → rechazado por el recompute
    // dentro de la tx (antes el check usaba un `remaining` leído fuera → doble-abono).
    await request
      .post('/workers/weekly/pay')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Approval-Pin', '135790')
      .field('payload', JSON.stringify({ userId: dailyId, weekStart: wk.weekStart, days: [], cashAmount: 0, bankAmount: 1_000 }))
      .attach('proof', png, 'p.png')
      .expect(400);
  });

  it('part-time DIARIO: los días de descanso del trabajador no se pagan', async () => {
    const hash = await bcrypt.hash('dev12345', 10);
    const pt = await prisma.user.create({
      data: {
        email: 'parttime-wk@test.local', fullName: 'Pepe PartTime', role: 'TRABAJADOR',
        passwordHash: hash, mustChangePwd: false, active: true,
        payType: 'DAILY', salaryAmount: 60_000, hireDate: new Date(Date.UTC(2020, 0, 1)),
        restDaysOfWeek: [0, 6], // descansa sábado y domingo
      },
    });
    const entry = (await getWeek()).entries.find((e) => e.userId === pt.id)!;
    expect(entry).toBeDefined();
    const rest = entry.days.filter((d) => d.weekday === 0 || d.weekday === 6);
    const work = entry.days.filter((d) => d.weekday !== 0 && d.weekday !== 6);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((d) => d.amount === 0 && d.status === 'REST')).toBe(true);
    expect(work.every((d) => d.amount === 60_000)).toBe(true);
    expect(entry.owedTotal).toBe(work.length * 60_000);
  });

  it('editar el valor de un día (llegada tarde / ausencia) cambia el adeudo y se revierte', async () => {
    const entry = (await getWeek()).entries.find((e) => e.userId === dailyId)!;
    const target = entry.days.find((d) => d.amount === 60_000 && !d.isPaid && !d.isFuture)!;
    expect(target).toBeDefined();
    const owedBefore = entry.owedTotal;

    // Llegada tarde: el día vale 20.000 en vez de 60.000.
    await request
      .post(`/workers/${dailyId}/day`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Approval-Pin', '135790')
      .send({ workDate: target.date, amount: 20_000, note: 'llegó tarde' })
      .expect(201);

    const edited = (await getWeek()).entries.find((e) => e.userId === dailyId)!;
    const dayEdited = edited.days.find((d) => d.date === target.date)!;
    expect(dayEdited.amount).toBe(20_000);
    expect(dayEdited.hasOverride).toBe(true);
    expect(edited.owedTotal).toBe(owedBefore - 40_000);

    // Quitar la excepción → vuelve al valor/día.
    await request
      .delete(`/workers/${dailyId}/day?date=${target.date}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Approval-Pin', '135790')
      .expect(200);

    const reverted = (await getWeek()).entries.find((e) => e.userId === dailyId)!;
    expect(reverted.days.find((d) => d.date === target.date)!.amount).toBe(60_000);
    expect(reverted.owedTotal).toBe(owedBefore);
  });
});
