/**
 * `/reports/anomalies` es el anti-fraude del dueño: marca el turno cuyo
 * descuadre TOTAL (cajón + cuenta) se sale de lo habitual de esa persona.
 * Necesita ≥5 turnos arqueados. Se siembran 6 cerrados: 5 con descuadre chico
 * (lo habitual) + 1 con un descuadre enorme → marca.
 *
 * Los dos casos que cierran §7.v71: un turno donde el cajón quedó corto y la
 * cuenta sobrada por lo mismo NO es un faltante (es un domicilio pagado del
 * cajón), y un descuadre viejo se marca igual que uno reciente.
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

  it('un turno con el cajón corto y la cuenta sobrada por lo mismo NO es faltante', async () => {
    const hash = await bcrypt.hash('dev12345', 10);
    const dom = await prisma.user.create({
      data: { email: 'op-dom-an@test.local', fullName: 'Op Domicilios', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    // Cinco turnos parejos + uno donde salieron $43.000 del cajón por un
    // domicilio que el cliente transfirió: cajón −43.000, cuenta +43.000.
    for (let i = 0; i < 5; i++) {
      await prisma.shift.create({
        data: { cashierId: dom.id, openingCash: 0, openedAt: day(i + 1), closedAt: day(i + 1), status: 'CLOSED', difference: 0,
          digitalCountBreakdown: [{ method: 'TRANSFER', expected: 10000, counted: 10000, difference: 0 }] },
      });
    }
    await prisma.shift.create({
      data: { cashierId: dom.id, openingCash: 0, openedAt: day(21), closedAt: day(21), status: 'CLOSED', difference: -43000,
        digitalCountBreakdown: [{ method: 'TRANSFER', expected: 10000, counted: 53000, difference: 43000 }] },
    });

    const res = await request.get('/reports/anomalies').set(auth()).expect(200);
    const me = (res.body as Array<{ cashierId: string; shifts: Array<{ difference: number; digitalDifference: number; totalDifference: number; flags: string[] }> }>)
      .find((r) => r.cashierId === dom.id)!;
    const reciente = me.shifts[0]!;
    expect(reciente.difference).toBe(-43000);
    expect(reciente.digitalDifference).toBe(43000);
    expect(reciente.totalDifference).toBe(0);
    expect(reciente.flags).toEqual([]);
  });

  it('un descuadre viejo se marca igual que uno reciente', async () => {
    const hash = await bcrypt.hash('dev12345', 10);
    const viejo = await prisma.user.create({
      data: { email: 'op-viejo-an@test.local', fullName: 'Op Viejo', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    // El descuadre grande queda en el MEDIO de la ventana, no al final.
    const diffs = [0, 0, 300000, 0, 0, 0];
    for (let i = 0; i < diffs.length; i++) {
      await prisma.shift.create({
        data: { cashierId: viejo.id, openingCash: 0, openedAt: day(i + 1), closedAt: day(i + 1), status: 'CLOSED', difference: diffs[i]! },
      });
    }

    const res = await request.get('/reports/anomalies').set(auth()).expect(200);
    const me = (res.body as Array<{ cashierId: string; shifts: Array<{ difference: number; flags: string[] }> }>)
      .find((r) => r.cashierId === viejo.id)!;
    const marcados = me.shifts.filter((s) => s.flags.includes('diff_high'));
    expect(marcados).toHaveLength(1);
    expect(marcados[0]!.difference).toBe(300000);
    // Y no es el más reciente: el de arriba es uno de los de $0.
    expect(me.shifts[0]!.flags).toEqual([]);
  });

  it('un turno con un medio sin arquear no se da por bueno ni se marca', async () => {
    const hash = await bcrypt.hash('dev12345', 10);
    const sinArq = await prisma.user.create({
      data: { email: 'op-sinarq-an@test.local', fullName: 'Op Sin Arqueo', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    for (let i = 0; i < 5; i++) {
      await prisma.shift.create({
        data: { cashierId: sinArq.id, openingCash: 0, openedAt: day(i + 1), closedAt: day(i + 1), status: 'CLOSED', difference: 0 },
      });
    }
    await prisma.shift.create({
      data: { cashierId: sinArq.id, openingCash: 0, openedAt: day(22), closedAt: day(22), status: 'CLOSED', difference: -900000,
        digitalCountBreakdown: [{ method: 'TRANSFER', expected: 10000, counted: null, difference: null }] },
    });

    const res = await request.get('/reports/anomalies').set(auth()).expect(200);
    const me = (res.body as Array<{ cashierId: string; shifts: Array<{ totalDifference: number | null; flags: string[] }> }>)
      .find((r) => r.cashierId === sinArq.id)!;
    expect(me.shifts[0]!.totalDifference).toBeNull();
    expect(me.shifts[0]!.flags).toEqual([]);
  });

  it('un arqueo digital con forma rara no tumba el reporte', async () => {
    // Defensa: la columna es JSON. Una fila vieja con otra forma tiraría un
    // TypeError y el reporte del dueño respondería 500 —que además abre una
    // alerta— en vez de decir que ese turno no se sabe.
    const hash = await bcrypt.hash('dev12345', 10);
    const raro = await prisma.user.create({
      data: { email: 'op-raro-an@test.local', fullName: 'Op Raro', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    for (let i = 0; i < 5; i++) {
      await prisma.shift.create({
        data: { cashierId: raro.id, openingCash: 0, openedAt: day(i + 1), closedAt: day(i + 1), status: 'CLOSED', difference: 0 },
      });
    }
    await prisma.shift.create({
      data: { cashierId: raro.id, openingCash: 0, openedAt: day(23), closedAt: day(23), status: 'CLOSED', difference: 0,
        // Un objeto donde el código espera una lista.
        digitalCountBreakdown: { TRANSFER: 10000 } as unknown as object },
    });

    const res = await request.get('/reports/anomalies').set(auth()).expect(200);
    const me = (res.body as Array<{ cashierId: string; shifts: Array<{ totalDifference: number | null; flags: string[] }> }>)
      .find((r) => r.cashierId === raro.id)!;
    expect(me.shifts[0]!.totalDifference).toBeNull();
    expect(me.shifts[0]!.flags).toEqual([]);
  });
});
