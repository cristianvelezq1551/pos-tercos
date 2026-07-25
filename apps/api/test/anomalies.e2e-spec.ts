/**
 * §4.6 (2σ): `/reports/anomalies` es el anti-fraude del dueño (marca al cajero
 * cuyo descuadre supera avg + 2σ de su propio histórico). Necesita ≥5 shifts de
 * baseline, por eso no tenía test. Se siembran 6 shifts cerrados: 5 con
 * descuadre chico (baseline) + 1 reciente con un descuadre enorme → flag.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Anomalías por cajero (2σ) E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let cashierId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const day = (n: number) => new Date(2026, 4, n, 10, 0, 0); // mayo, días distintos

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Auto-aislada: no confiar en que la suite anterior limpió. Esta suite lee
    // agregados GLOBALES (reportes / ledger de inventario), así que un residuo
    // de otra suite mueve los números y el fallo depende del orden de archivos.
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    const [, cashier] = await prisma.user.createManyAndReturn({
      data: [
        { email: 'dueno-an@test.local', fullName: 'Dueño AN', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'op-an@test.local', fullName: 'Op AN', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
    });
    cashierId = cashier.id;
    token = await loginAs(request, 'dueno-an@test.local');

    // Baseline: 5 shifts cerrados con descuadre chico y variado.
    const baselineDiffs = [500, 1000, 1500, 800, 1200];
    for (let i = 0; i < baselineDiffs.length; i++) {
      await prisma.shift.create({
        data: {
          cashierId, openingCash: 100000, openedAt: day(i + 1), closedAt: day(i + 1),
          status: 'CLOSED', expectedCash: 100000, countedCash: 100000 + baselineDiffs[i]!, difference: baselineDiffs[i]!,
        },
      });
    }
    // Shift MÁS RECIENTE (mayor openedAt) con un descuadre ENORME → debe marcarse.
    await prisma.shift.create({
      data: {
        cashierId, openingCash: 100000, openedAt: day(20), closedAt: day(20),
        status: 'CLOSED', expectedCash: 100000, countedCash: 600000, difference: 500000,
      },
    });
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('el cajero con un descuadre reciente muy por encima de su histórico queda flaggeado', async () => {
    const res = await request.get('/reports/anomalies').set(auth()).expect(200);
    const rows = res.body as Array<{
      cashierId: string;
      baseline: unknown | null;
      shifts: Array<{ difference: number | null; flags: string[] }>;
    }>;
    const me = rows.find((r) => r.cashierId === cashierId);
    expect(me).toBeDefined();
    // Con 5 shifts de baseline el análisis se calcula (no queda en null).
    expect(me!.baseline).not.toBeNull();
    // El shift más reciente (el primero, orden desc) es el del descuadre enorme.
    expect(me!.shifts[0]!.difference).toBe(500000);
    expect(me!.shifts[0]!.flags).toContain('diff_high');
    // Un shift de baseline NO está flaggeado.
    expect(me!.shifts[1]!.flags).not.toContain('diff_high');
  });

  it('un cajero SIN baseline suficiente no calcula flags (null)', async () => {
    const hash = await bcrypt.hash('dev12345', 10);
    const nuevo = await prisma.user.create({
      data: { email: 'op-nuevo-an@test.local', fullName: 'Op Nuevo', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    // Solo 2 shifts → baseline (1) < 5 → sin flags.
    await prisma.shift.create({ data: { cashierId: nuevo.id, openingCash: 0, openedAt: day(1), closedAt: day(1), status: 'CLOSED', difference: 100000 } });
    await prisma.shift.create({ data: { cashierId: nuevo.id, openingCash: 0, openedAt: day(2), closedAt: day(2), status: 'CLOSED', difference: 200000 } });

    const res = await request.get('/reports/anomalies').set(auth()).expect(200);
    const me = (res.body as Array<{ cashierId: string; baseline: unknown | null }>).find((r) => r.cashierId === nuevo.id);
    expect(me).toBeDefined();
    expect(me!.baseline).toBeNull();
  });
});
