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
});
