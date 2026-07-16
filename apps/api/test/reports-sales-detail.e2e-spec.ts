/**
 * reports-sales-detail.e2e-spec.ts
 *
 * Auditoría del listado detallado de ventas del reporte (`/reports/sales`):
 *   - Rangos: día, semana, mes, rango explícito pasado.
 *   - INVARIANTE: el detalle y el resumen describen el MISMO universo
 *     (sum(detalle.total) === resumen.revenue, detalle.length === count).
 *     Si esto se rompe, el dueño ve un total arriba y otro abajo.
 *   - Exclusiones: VOID y PENDIENTE_PAGO fuera; CANCELADO_SIN_REEMBOLSO dentro.
 *   - Modo arqueo (`shift_id`): la caja manda sobre el rango — cubre la noche
 *     que cruza medianoche, que es el caso que motivó la feature.
 *   - `GET /shifts?from&to` (selector de arqueos) + su retrocompatibilidad.
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/** Instante local: `daysAgo` días atrás a la hora `hour`. */
const at = (daysAgo: number, hour: number, minute = 0): Date => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/** YYYY-MM-DD local de `daysAgo` días atrás (lo que manda el RangeFilter). */
const ymd = (daysAgo: number): string => {
  const d = at(daysAgo, 12);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

interface SaleSeed {
  id: string;
  paidAt: Date | null;
  total: number;
  status: string;
  shiftId: string | null;
}

describe('Reports · detalle de ventas (auditoría de rangos y arqueo)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;
  let productId: string;
  let cashierId: string;

  // Cajas: A vieja, B cruza medianoche (ayer 17:00 → hoy 02:00), C abierta hoy.
  const shiftA = '11111111-1111-1111-1111-111111111111';
  const shiftB = '22222222-2222-2222-2222-222222222222';
  const shiftC = '33333333-3333-3333-3333-333333333333';

  // Ventas sembradas con paidAt explícito (la API estamparía `now`).
  const SALES: SaleSeed[] = [
    { id: 'aaaa0001-0000-4000-8000-000000000001', paidAt: at(0, 10), total: 10_000, status: 'PAGADO', shiftId: shiftC },
    { id: 'aaaa0002-0000-4000-8000-000000000002', paidAt: at(1, 20), total: 20_000, status: 'PAGADO', shiftId: shiftB },
    // Madrugada de HOY, pero pertenece a la caja de AYER — el caso clave.
    { id: 'aaaa0003-0000-4000-8000-000000000003', paidAt: at(0, 1, 30), total: 30_000, status: 'PAGADO', shiftId: shiftB },
    { id: 'aaaa0004-0000-4000-8000-000000000004', paidAt: at(10, 12), total: 40_000, status: 'PAGADO', shiftId: shiftA },
    { id: 'aaaa0005-0000-4000-8000-000000000005', paidAt: at(40, 12), total: 50_000, status: 'PAGADO', shiftId: shiftA },
    // Cobrada y luego anulada: fuera del detalle, pero cuenta en voidCount.
    { id: 'aaaa0006-0000-4000-8000-000000000006', paidAt: at(0, 11), total: 60_000, status: 'VOID', shiftId: shiftC },
    // Nunca se pagó: fuera de todo.
    { id: 'aaaa0007-0000-4000-8000-000000000007', paidAt: null, total: 70_000, status: 'PENDIENTE_PAGO', shiftId: shiftC },
    // Cancelada SIN reembolso: el cliente pagó → SÍ es ingreso.
    { id: 'aaaa0008-0000-4000-8000-000000000008', paidAt: at(0, 9), total: 5_000, status: 'CANCELADO_SIN_REEMBOLSO', shiftId: shiftC },
  ];

  const idsOf = (body: { id: string }[]): string[] => body.map((s) => s.id).sort();
  const sumOf = (body: { total: number }[]): number =>
    body.reduce((s, x) => s + Number(x.total), 0);

  const getDetail = async (qs: string): Promise<{ id: string; total: number }[]> => {
    const res = await request
      .get(`/reports/sales-detail${qs}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    return res.body;
  };

  const getSummary = async (qs: string) => {
    const res = await request
      .get(`/reports/sales-summary${qs}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    return res.body;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    const dueno = await prisma.user.create({
      data: {
        email: 'dueno-rsd@test.local',
        fullName: 'Dueño RSD',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    const cajero = await prisma.user.create({
      data: {
        email: 'cajero-rsd@test.local',
        fullName: 'Cajero RSD',
        role: 'CAJERO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    cashierId = cajero.id;
    void dueno;

    duenoToken = await loginAs(request, 'dueno-rsd@test.local');
    cajeroToken = await loginAs(request, 'cajero-rsd@test.local');

    const prodRes = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Producto RSD',
        category: 'Test',
        basePrice: 10_000,
        isActive: true,
        directResale: true,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'unit',
        unitStock: 'unit',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    productId = prodRes.body.id;

    await prisma.shift.createMany({
      data: [
        { id: shiftA, cashierId, openingCash: 100_000, openedAt: at(10, 8), closedAt: at(10, 22), status: 'CLOSED' },
        // Cruza medianoche: abre ayer 17:00, cierra hoy 02:00.
        { id: shiftB, cashierId, openingCash: 100_000, openedAt: at(1, 17), closedAt: at(0, 2), status: 'CLOSED' },
        { id: shiftC, cashierId, openingCash: 100_000, openedAt: at(0, 8), status: 'OPEN' },
      ],
    });

    for (const s of SALES) {
      await prisma.sale.create({
        data: {
          id: s.id,
          type: 'COUNTER',
          status: s.status as never,
          subtotal: s.total,
          total: s.total,
          paidAt: s.paidAt,
          paymentMethod: s.paidAt ? 'CASH' : null,
          cashierId,
          shiftId: s.shiftId,
          createdAt: s.paidAt ?? at(0, 8),
          items: {
            create: [
              {
                productId,
                quantity: 1,
                unitPrice: s.total,
                lineSubtotal: s.total,
                lineTotal: s.total,
              },
            ],
          },
          payments: s.paidAt
            ? { create: [{ method: 'CASH', amount: s.total, amountReceived: s.total }] }
            : undefined,
        },
      });
    }
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ── Rangos ───────────────────────────────────────────────────────
  describe('rangos de fecha', () => {
    it('día (hoy): solo lo cobrado hoy, incluida la madrugada', async () => {
      const body = await getDetail(`?from=${ymd(0)}&to=${ymd(0)}`);
      expect(idsOf(body)).toEqual(
        [SALES[0].id, SALES[2].id, SALES[7].id].sort(),
      );
      expect(sumOf(body)).toBe(45_000); // 10k + 30k + 5k
    });

    it('semana (7 días): suma lo de ayer, sin lo de hace 10 días', async () => {
      const body = await getDetail(`?from=${ymd(6)}&to=${ymd(0)}`);
      expect(idsOf(body)).toEqual(
        [SALES[0].id, SALES[1].id, SALES[2].id, SALES[7].id].sort(),
      );
      expect(sumOf(body)).toBe(65_000);
    });

    it('mes (30 días): suma la de hace 10 días, sin la de hace 40', async () => {
      const body = await getDetail(`?from=${ymd(29)}&to=${ymd(0)}`);
      expect(idsOf(body)).toContain(SALES[3].id);
      expect(idsOf(body)).not.toContain(SALES[4].id);
      expect(sumOf(body)).toBe(105_000);
    });

    it('rango explícito pasado: aísla ese día', async () => {
      const body = await getDetail(`?from=${ymd(10)}&to=${ymd(10)}`);
      expect(idsOf(body)).toEqual([SALES[3].id]);
    });

    it('sin from/to aplica el default de 7 días', async () => {
      const body = await getDetail('');
      expect(idsOf(body)).not.toContain(SALES[3].id); // 10 días atrás
      expect(sumOf(body)).toBe(65_000);
    });

    it('rango sin ventas devuelve lista vacía', async () => {
      const body = await getDetail(`?from=${ymd(400)}&to=${ymd(390)}`);
      expect(body).toEqual([]);
    });
  });

  // ── El invariante que sostiene todo el reporte ───────────────────
  describe('coherencia con el resumen (mismo universo)', () => {
    it.each([
      ['día', `?from=${ymd(0)}&to=${ymd(0)}`],
      ['semana', `?from=${ymd(6)}&to=${ymd(0)}`],
      ['mes', `?from=${ymd(29)}&to=${ymd(0)}`],
      ['default', ''],
    ])('%s: el detalle suma exactamente los ingresos del resumen', async (_label, qs) => {
      const [detail, summary] = await Promise.all([getDetail(qs), getSummary(qs)]);
      expect(detail.length).toBe(summary.totals.count);
      expect(sumOf(detail)).toBe(summary.totals.revenue);
    });
  });

  // ── Exclusiones ──────────────────────────────────────────────────
  describe('qué entra y qué no', () => {
    it('la anulada no aparece en el detalle pero el resumen la cuenta', async () => {
      const qs = `?from=${ymd(0)}&to=${ymd(0)}`;
      const [detail, summary] = await Promise.all([getDetail(qs), getSummary(qs)]);
      expect(idsOf(detail)).not.toContain(SALES[5].id);
      expect(summary.totals.voidCount).toBe(1);
    });

    it('la pendiente de pago no aparece', async () => {
      const body = await getDetail(`?from=${ymd(0)}&to=${ymd(0)}`);
      expect(idsOf(body)).not.toContain(SALES[6].id);
    });

    it('la cancelada sin reembolso SÍ aparece (el cliente pagó)', async () => {
      const body = await getDetail(`?from=${ymd(0)}&to=${ymd(0)}`);
      expect(idsOf(body)).toContain(SALES[7].id);
    });
  });

  // ── Payload ──────────────────────────────────────────────────────
  describe('forma del listado', () => {
    it('viene ordenado por paidAt desc', async () => {
      const body = await getDetail(`?from=${ymd(29)}&to=${ymd(0)}`);
      const times = (body as unknown as { paidAt: string }[]).map((s) =>
        new Date(s.paidAt).getTime(),
      );
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('trae items y pagos de cada venta', async () => {
      const body = (await getDetail(`?from=${ymd(0)}&to=${ymd(0)}`)) as unknown as {
        items: unknown[];
        payments: unknown[];
        cashierName: string;
      }[];
      for (const sale of body) {
        expect(sale.items.length).toBeGreaterThan(0);
        expect(sale.payments.length).toBeGreaterThan(0);
        expect(sale.cashierName).toBe('Cajero RSD');
      }
    });
  });

  // ── Modo arqueo ──────────────────────────────────────────────────
  describe('modo arqueo (shift_id)', () => {
    it('lista la caja completa aunque cruce medianoche (2 días calendario)', async () => {
      const body = await getDetail(`?shift_id=${shiftB}`);
      expect(idsOf(body)).toEqual([SALES[1].id, SALES[2].id].sort());
      expect(sumOf(body)).toBe(50_000);
    });

    it('la caja manda sobre el rango de fechas', async () => {
      // Rango = solo hoy, pero la caja B tiene una venta de AYER: debe salir igual.
      const body = await getDetail(`?shift_id=${shiftB}&from=${ymd(0)}&to=${ymd(0)}`);
      expect(idsOf(body)).toEqual([SALES[1].id, SALES[2].id].sort());
    });

    it('excluye anuladas y pendientes de esa caja', async () => {
      const body = await getDetail(`?shift_id=${shiftC}`);
      expect(idsOf(body)).toEqual([SALES[0].id, SALES[7].id].sort());
    });

    it('caja inexistente → lista vacía', async () => {
      expect(await getDetail(`?shift_id=${NIL_UUID}`)).toEqual([]);
    });

    it('shift_id inválido → 400', async () => {
      await request
        .get('/reports/sales-detail?shift_id=no-es-uuid')
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(400);
    });
  });

  // ── Selector de arqueos ──────────────────────────────────────────
  describe('GET /shifts con rango (selector de arqueos)', () => {
    const listShifts = async (qs: string): Promise<{ id: string }[]> => {
      const res = await request
        .get(`/shifts${qs}`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(200);
      return res.body;
    };

    it('acota por openedAt: la caja pertenece al día en que ABRIÓ', async () => {
      // Caja B abrió AYER y cerró HOY → cae bajo ayer, no bajo hoy.
      const ayer = await listShifts(`?from=${ymd(1)}&to=${ymd(1)}`);
      expect(idsOf(ayer)).toEqual([shiftB]);

      const hoy = await listShifts(`?from=${ymd(0)}&to=${ymd(0)}`);
      expect(idsOf(hoy)).toEqual([shiftC]);
    });

    it('el día `to` entra completo', async () => {
      const body = await listShifts(`?from=${ymd(1)}&to=${ymd(0)}`);
      expect(idsOf(body)).toEqual([shiftB, shiftC].sort());
    });

    it('rango viejo alcanza cajas fuera del techo del selector', async () => {
      const body = await listShifts(`?from=${ymd(10)}&to=${ymd(10)}`);
      expect(idsOf(body)).toEqual([shiftA]);
    });

    it('rango sin cajas → vacío', async () => {
      expect(await listShifts(`?from=${ymd(400)}&to=${ymd(390)}`)).toEqual([]);
    });

    it('retrocompat: sin from/to devuelve todas', async () => {
      const body = await listShifts('?limit=100');
      expect(idsOf(body)).toEqual([shiftA, shiftB, shiftC].sort());
    });

    it.each([
      ['fecha irreal', '?from=2026-13-45'],
      ['30 de febrero', '?from=2026-02-30'],
      ['basura', '?from=basura'],
      ['from > to', '?from=2026-07-20&to=2026-07-01'],
    ])('%s → 400', async (_label, qs) => {
      await request
        .get(`/shifts${qs}`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(400);
    });
  });

  // ── Permisos ─────────────────────────────────────────────────────
  describe('permisos', () => {
    it('el cajero no puede ver el detalle del reporte', async () => {
      await request
        .get('/reports/sales-detail')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(403);
    });

    it('sin token → 401', async () => {
      await request.get('/reports/sales-detail').expect(401);
    });
  });
});
