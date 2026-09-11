/**
 * §7.v70 — Nada entra al inventario a $0.
 *
 * Un ajuste manual sin precio o un sobrante de conteo creaban un lote a $0 y
 * lo que salía de él se vendía gratis: el margen quedaba inflado sin aviso.
 * Ahora la entrada se valora al escribir (último costo conocido), queda marcada
 * como estimada, y el estado financiero la rotula "estimado" — no "parcial",
 * que es lo que se dice cuando de verdad no hay ningún precio.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Entradas sin costo se estiman (§7.v70)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let cogs: CogsService;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const now = new Date();

  const statement = async () => {
    cogs.invalidateLedgerCache();
    return (
      await request
        .get(`/reports/financial/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
        .set(auth())
        .expect(200)
    ).body as { cogs: number; cogsEstimated: boolean; cogsPartial: boolean; wasteCost: number; wasteCostEstimated: boolean };
  };

  const crearInsumo = async (name: string) =>
    (
      await request
        .post('/ingredients')
        .set(auth())
        .send({ name, unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0, isActive: true })
        .expect(201)
    ).body.id as string;

  const comprar = async (ingredientId: string, kg: number, total: number) =>
    request
      .post('/invoices/manual')
      .set(auth())
      .send({
        supplierNit: `9${Date.now()}`,
        supplierName: 'Proveedor ESC',
        total,
        items: [{ entityType: 'INGREDIENT', ingredientId, descriptionRaw: 'x', quantity: kg, unit: 'kg', unitPrice: total / kg, total }],
      })
      .expect(201);

  const productoCon = async (ingredientId: string, gramos: number) => {
    const id = (
      await request
        .post('/products')
        .set(auth())
        .send({ category: 'Test', name: `Plato ${randomUUID().slice(0, 6)}`, basePrice: 10_000, directResale: false, modifiersEnabled: false })
        .expect(201)
    ).body.id as string;
    await request
      .put(`/products/${id}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: ingredientId, quantityNeta: gramos, mermaPct: 0 }] })
      .expect(200);
    return id;
  };

  const vender = async (productId: string, quantity: number) => {
    const s = (
      await request
        .post('/sales')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity }] })
        .expect(201)
    ).body;
    await request.post(`/sales/${s.id}/confirm-payment`).set(auth()).send({ method: 'CASH', amountReceived: Number(s.total) }).expect(201);
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    cogs = app.get(CogsService);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'dueno-esc@test.local', fullName: 'Dueño ESC', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    await prisma.productCategory.createMany({ data: [{ name: 'Test', sortOrder: 0, isActive: true }], skipDuplicates: true });
    token = await loginAs(request, 'dueno-esc@test.local');
    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('un ajuste manual sin costo sobre un insumo con precio entra costeado y marcado; lo vendido de ahí es estimado, no parcial', async () => {
    const carne = await crearInsumo('Carne ESC');
    // Precio de referencia: una compra a $30.000/kg = $30/g.
    await comprar(carne, 1, 30_000);
    const antes = await statement();

    const mov = (
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ entityType: 'INGREDIENT', ingredientId: carne, delta: 500, type: 'MANUAL_ADJUSTMENT', notes: 'cuadre' })
        .expect(201)
    ).body as { unitCost: number | null; unitCostEstimated?: boolean; notes: string | null };
    expect(mov.unitCost).toBe(30);
    expect(mov.unitCostEstimated).toBe(true);
    expect(mov.notes).toContain('estimado');

    // Se consume TODO lo comprado (1.000 g) y 500 g más: esos 500 salen del lote estimado.
    const plato = await productoCon(carne, 150);
    await vender(plato, 10); // 1.500 g
    const despues = await statement();
    expect(despues.cogs - antes.cogs).toBeCloseTo(1_500 * 30, 2);
    expect(despues.cogsEstimated).toBe(true);
    expect(despues.cogsPartial).toBe(false);
  });

  it('un sobrante de conteo entra costeado y marcado; sin ningún precio, entra sin valor (parcial)', async () => {
    const queso = await crearInsumo('Queso ESC');
    await comprar(queso, 1, 25_000); // $25/g
    const ledgerQty = Number((await request.get(`/inventory/stock/ingredient/${queso}`).set(auth()).expect(200)).body.currentStock);
    const conteo = (
      await request
        .post('/inventory/counts')
        .set(auth())
        .send({ entityType: 'INGREDIENT', ingredientId: queso, countedQty: ledgerQty + 200 })
        .expect(201)
    ).body as { id: string; status: string };
    if (conteo.status === 'PENDING') await request.post(`/inventory/counts/${conteo.id}/approve`).set(auth()).send({}).expect(201);
    const ajuste = await prisma.inventoryMovement.findFirst({ where: { sourceType: 'stock_count', sourceId: conteo.id } });
    expect(Number(ajuste!.unitCost)).toBe(25);
    expect(ajuste!.unitCostEstimated).toBe(true);

    const nuevo = await crearInsumo('Eneldo ESC'); // nunca comprado: no hay precio
    const sinPrecio = (
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ entityType: 'INGREDIENT', ingredientId: nuevo, delta: 100, type: 'INITIAL' })
        .expect(201)
    ).body as { unitCost: number | null; unitCostEstimated?: boolean };
    expect(sinPrecio.unitCost).toBeNull();
    expect(sinPrecio.unitCostEstimated).toBe(false);
  });

  it('la merma que sale de un lote estimado se rotula estimada en el estado', async () => {
    const tomate = await crearInsumo('Tomate ESC');
    await comprar(tomate, 1, 4_000); // $4/g
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'INGREDIENT', ingredientId: tomate, delta: 300, type: 'MANUAL_ADJUSTMENT' })
      .expect(201);
    const antes = await statement();
    // Tira 1.200 g: 1.000 del lote real y 200 del estimado.
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'INGREDIENT', ingredientId: tomate, delta: -1_200, type: 'WASTE', notes: 'Se dañó' })
      .expect(201);
    const despues = await statement();
    expect(despues.wasteCost - antes.wasteCost).toBeCloseTo(1_200 * 4, 2);
    expect(despues.wasteCostEstimated).toBe(true);
  });

  it('un subproducto que entra sin costo se valora por su receta; sin receta costeable, sin valor', async () => {
    const harina = await crearInsumo('Harina ESC');
    await comprar(harina, 1, 4_000); // $4/g
    const sub = (
      await request
        .post('/subproducts')
        .set(auth())
        .send({ name: 'Masa ESC', yield: 10, unit: 'porción', thresholdMin: 0, isActive: true })
        .expect(201)
    ).body.id as string;
    // 1.000 g de harina rinden 10 porciones → $400/porción.
    await request
      .put(`/subproducts/${sub}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: harina, quantityNeta: 1_000, mermaPct: 0 }] })
      .expect(200);
    const mov = (
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ entityType: 'SUBPRODUCT', subproductId: sub, delta: 5, type: 'MANUAL_ADJUSTMENT' })
        .expect(201)
    ).body as { unitCost: number | null; unitCostEstimated?: boolean };
    expect(mov.unitCost).toBe(400);
    expect(mov.unitCostEstimated).toBe(true);

    const huerfano = (
      await request
        .post('/subproducts')
        .set(auth())
        .send({ name: 'Sin receta ESC', yield: 1, unit: 'porción', thresholdMin: 0, isActive: true })
        .expect(201)
    ).body.id as string;
    const sinCosto = (
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ entityType: 'SUBPRODUCT', subproductId: huerfano, delta: 5, type: 'MANUAL_ADJUSTMENT' })
        .expect(201)
    ).body as { unitCost: number | null; unitCostEstimated?: boolean };
    expect(sinCosto.unitCost).toBeNull();
    expect(sinCosto.unitCostEstimated).toBe(false);
  });
});
