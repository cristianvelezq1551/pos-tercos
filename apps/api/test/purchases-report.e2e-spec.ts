/**
 * Reporte de compras y domicilios (`GET /reports/purchases`).
 *
 * Responde la pregunta que motivó todo el bloque: "¿cuánto gasté en domicilios
 * esta semana?". Lo que se protege acá es que el porcentaje sea comparable —el
 * número con el que se negocia con un proveedor— y que las semanas sin compras
 * NO desaparezcan de la serie.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

interface Figures {
  purchased: number;
  freight: number;
  freightPct: number | null;
  invoiceCount: number;
  invoicesWithFreight: number;
}
interface Report {
  periodFrom: string;
  periodTo: string;
  granularity: 'weekly' | 'monthly';
  totals: Figures;
  periods: Array<Figures & { key: string; label: string; periodFrom: string; periodTo: string }>;
  bySupplier: Array<Figures & { supplierId: string | null; supplierName: string }>;
}

describe('Reporte de compras y domicilios E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let cocineroToken: string;
  let ingredientId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const ymd = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /** Factura CONFIRMADA con fecha de confirmación forzada, para caer en el
   *  período que el caso necesita sin depender del día en que corra el test. */
  const facturar = async (opts: {
    mercancia: number;
    flete: number;
    proveedor: string;
    nit: string;
    confirmadaEl: Date;
  }): Promise<void> => {
    const draft = await prisma.invoice.create({
      data: { status: 'PENDING_REVIEW', aiModelUsed: 'test-mock', aiExtractionJson: {} },
    });
    await request
      .post(`/invoices/${draft.id}/confirm`)
      .set(auth())
      .send({
        supplierNit: opts.nit,
        supplierName: opts.proveedor,
        total: opts.mercancia + opts.flete,
        freight: opts.flete > 0 ? opts.flete : undefined,
        items: [
          {
            entityType: 'INGREDIENT',
            ingredientId,
            descriptionRaw: 'Insumo test',
            quantity: 1,
            unit: 'kg',
            unitPrice: opts.mercancia,
            total: opts.mercancia,
          },
        ],
      })
      .expect(201);
    await prisma.invoice.update({
      where: { id: draft.id },
      data: { confirmedAt: opts.confirmadaEl },
    });
  };

  const reporte = async (qs: string): Promise<Report> =>
    (await request.get(`/reports/purchases?${qs}`).set(auth()).expect(200)).body as Report;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-pr@test.local', fullName: 'Dueño PR', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cocinero-pr@test.local', fullName: 'Cocinero PR', role: 'COCINERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
    });
    token = await loginAs(request, 'dueno-pr@test.local');
    cocineroToken = await loginAs(request, 'cocinero-pr@test.local');

    const ing = await request
      .post('/ingredients')
      .set(auth())
      .send({ name: 'Insumo PR', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0 })
      .expect(201);
    ingredientId = ing.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('el total separa mercancía de domicilio y calcula el peso sobre lo comprado', async () => {
    const hoy = new Date();
    await facturar({ mercancia: 200_000, flete: 10_000, proveedor: 'Carnes Prueba', nit: '900111111-1', confirmadaEl: hoy });
    await facturar({ mercancia: 100_000, flete: 0, proveedor: 'Verduras Prueba', nit: '900222222-2', confirmadaEl: hoy });

    const r = await reporte(`from=${ymd(hoy)}&to=${ymd(hoy)}`);

    expect(r.totals.purchased).toBeCloseTo(300_000, 2);
    expect(r.totals.freight).toBeCloseTo(10_000, 2);
    // El % se mide contra la MERCANCÍA, no contra el total pagado: es lo que
    // hace comparable a un proveedor caro con uno barato.
    expect(r.totals.freightPct).toBeCloseTo(10_000 / 300_000, 4);
    expect(r.totals.invoiceCount).toBe(2);
    expect(r.totals.invoicesWithFreight).toBe(1);
  });

  it('por proveedor, el que MÁS cobró por traer queda primero', async () => {
    const hoy = new Date();
    await facturar({ mercancia: 50_000, flete: 25_000, proveedor: 'Caro Prueba', nit: '900333333-3', confirmadaEl: hoy });

    const r = await reporte(`from=${ymd(hoy)}&to=${ymd(hoy)}`);

    expect(r.bySupplier[0].supplierName).toBe('Caro Prueba');
    expect(r.bySupplier[0].freight).toBeCloseTo(25_000, 2);
    // Y su peso delata el problema: 50% contra el 5% del otro.
    expect(r.bySupplier[0].freightPct).toBeCloseTo(0.5, 4);
    const verduras = r.bySupplier.find((s) => s.supplierName === 'Verduras Prueba');
    expect(verduras!.freight).toBe(0);
    expect(verduras!.freightPct).toBe(0);
  });

  it('las semanas SIN compras aparecen en la serie (un hueco es información)', async () => {
    const hoy = new Date();
    const hace3Semanas = new Date(hoy);
    hace3Semanas.setDate(hace3Semanas.getDate() - 21);

    const r = await reporte(`from=${ymd(hace3Semanas)}&to=${ymd(hoy)}&granularity=weekly`);

    // Al menos 4 semanas tocadas por el rango, y las vacías van en cero (no se
    // saltean: si no, la serie se leería como semanas consecutivas).
    expect(r.periods.length).toBeGreaterThanOrEqual(4);
    const vacias = r.periods.filter((p) => p.invoiceCount === 0);
    expect(vacias.length).toBeGreaterThan(0);
    for (const v of vacias) {
      expect(v.purchased).toBe(0);
      expect(v.freight).toBe(0);
      expect(v.freightPct).toBeNull();
    }
  });

  it('la suma de los períodos es igual al total (ninguna factura se pierde ni se cuenta dos veces)', async () => {
    const hoy = new Date();
    const hace30 = new Date(hoy);
    hace30.setDate(hace30.getDate() - 30);
    const r = await reporte(`from=${ymd(hace30)}&to=${ymd(hoy)}&granularity=weekly`);

    const sumaFlete = r.periods.reduce((a, p) => a + p.freight, 0);
    const sumaCompra = r.periods.reduce((a, p) => a + p.purchased, 0);
    const sumaFacturas = r.periods.reduce((a, p) => a + p.invoiceCount, 0);
    expect(sumaFlete).toBeCloseTo(r.totals.freight, 2);
    expect(sumaCompra).toBeCloseTo(r.totals.purchased, 2);
    expect(sumaFacturas).toBe(r.totals.invoiceCount);

    // Lo mismo por proveedor: los dos cortes miran las MISMAS facturas.
    expect(r.bySupplier.reduce((a, s) => a + s.freight, 0)).toBeCloseTo(r.totals.freight, 2);
    expect(r.bySupplier.reduce((a, s) => a + s.invoiceCount, 0)).toBe(r.totals.invoiceCount);
  });

  it('agrupar por mes devuelve un período por mes calendario', async () => {
    const hoy = new Date();
    const r = await reporte(`from=${ymd(hoy)}&to=${ymd(hoy)}&granularity=monthly`);
    expect(r.granularity).toBe('monthly');
    expect(r.periods).toHaveLength(1);
    expect(r.periods[0].key).toMatch(/^\d{4}-\d{2}$/);
  });

  it('una factura sin confirmar NO cuenta (todavía no entró nada)', async () => {
    const hoy = new Date();
    const antes = await reporte(`from=${ymd(hoy)}&to=${ymd(hoy)}`);
    await prisma.invoice.create({
      data: {
        status: 'PENDING_REVIEW',
        aiModelUsed: 'test-mock',
        aiExtractionJson: {},
        total: 999_000,
        freightAmount: 99_000,
      },
    });
    const despues = await reporte(`from=${ymd(hoy)}&to=${ymd(hoy)}`);
    expect(despues.totals.freight).toBeCloseTo(antes.totals.freight, 2);
    expect(despues.totals.invoiceCount).toBe(antes.totals.invoiceCount);
  });

  it('un agrupamiento inválido es 400, no un reporte con otro corte', async () => {
    await request.get('/reports/purchases?granularity=diario').set(auth()).expect(400);
  });

  it('una fecha mal formada es 400 (no degrada al rango por defecto)', async () => {
    await request.get('/reports/purchases?from=ayer').set(auth()).expect(400);
  });

  it('el cocinero no puede ver lo que paga el negocio (403)', async () => {
    await request
      .get('/reports/purchases')
      .set({ Authorization: `Bearer ${cocineroToken}` })
      .expect(403);
  });
});
