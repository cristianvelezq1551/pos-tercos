/**
 * §4.5: `forceAvailable` y los consumibles (`blocksAvailability=false`) solo
 * tenían tests de DOMAIN. Acá se cubre el camino del COBRO (donde el bypass de
 * `assertStockSufficient` es un riesgo de dinero): un producto forzado se cobra
 * pese al stock 0 (queda negativo), y un consumible en 0 NO frena la venta pero
 * SÍ se descuenta. + el panel `/inventory/stock?negative=true`.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Forzar disponible + consumibles en el cobro E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const sellAndPay = async (productId: string, amount: number) => {
    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
      .expect(201);
    return request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: amount });
  };

  const stockOf = async (entityType: string, id: string): Promise<number> => {
    const res = await request.get(`/inventory/stock/${entityType}/${id}`).set(auth()).expect(200);
    return Number(res.body.currentStock);
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'dueno-fa@test.local', fullName: 'Dueño FA', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    token = await loginAs(request, 'dueno-fa@test.local');
    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('un producto de reventa SIN forzar y con stock 0 NO se puede cobrar (409)', async () => {
    const p = await request
      .post('/products')
      .set(auth())
      .send({ name: 'Agua Normal', basePrice: 3000, directResale: true, unitPurchase: 'caja', unitStock: 'unit', conversionFactor: 12, modifiersEnabled: false })
      .expect(201);
    // Sin stock → el cobro valida y rechaza.
    const res = await sellAndPay(p.body.id, 3000);
    expect(res.status).toBe(409);
  });

  it('un producto FORZADO con stock 0 se cobra igual y queda en negativo', async () => {
    const p = await request
      .post('/products')
      .set(auth())
      .send({ name: 'Agua Forzada', basePrice: 3000, directResale: true, unitPurchase: 'caja', unitStock: 'unit', conversionFactor: 12, modifiersEnabled: false })
      .expect(201);
    await request.post(`/products/${p.body.id}/force-available`).set(auth()).send({ forceAvailable: true }).expect(201);

    expect((await sellAndPay(p.body.id, 3000)).status).toBe(201); // NO 409
    expect(await stockOf('product', p.body.id)).toBe(-1);

    // El panel de negativos lo lista.
    const neg = await request.get('/inventory/stock?negative=true').set(auth()).expect(200);
    expect((neg.body as Array<{ id: string }>).some((s) => s.id === p.body.id)).toBe(true);
  });

  it('un consumible (blocksAvailability=false) en 0 NO frena la venta pero SÍ se descuenta', async () => {
    // Insumo que BLOQUEA (con stock) + consumible (servilleta) SIN stock.
    const pan = await request
      .post('/ingredients')
      .set(auth())
      .send({ name: 'Pan FA', unitPurchase: 'bolsa', unitRecipe: 'unit', conversionFactor: 10, thresholdMin: 0 })
      .expect(201);
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'INGREDIENT', ingredientId: pan.body.id, delta: 100, type: 'INITIAL', unitCost: 50 })
      .expect(201);
    const serv = await request
      .post('/ingredients')
      .set(auth())
      .send({ name: 'Servilleta FA', unitPurchase: 'paquete', unitRecipe: 'unit', conversionFactor: 100, thresholdMin: 0 })
      .expect(201);

    const burger = await request
      .post('/products')
      .set(auth())
      .send({ name: 'Burger FA', basePrice: 8000, directResale: false, unitPurchase: 'unit', unitStock: 'unit', conversionFactor: 1, modifiersEnabled: false })
      .expect(201);
    await request
      .put(`/products/${burger.body.id}/recipe`)
      .set(auth())
      .send({
        edges: [
          { childType: 'ingredient', childId: pan.body.id, quantityNeta: 1 },
          // La servilleta NO frena (consumible), aunque esté en 0.
          { childType: 'ingredient', childId: serv.body.id, quantityNeta: 1, blocksAvailability: false },
        ],
      })
      .expect(200);

    // La venta se cobra (el consumible en 0 no bloquea) y descuenta ambos.
    expect((await sellAndPay(burger.body.id, 8000)).status).toBe(201);
    expect(await stockOf('ingredient', pan.body.id)).toBe(99);
    expect(await stockOf('ingredient', serv.body.id)).toBe(-1); // se descontó igual
  });
});
