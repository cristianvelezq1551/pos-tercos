/**
 * §4.3: purchase-suggestions no tenía NINGÚN test (773 líneas + cron horario).
 * Un bug en el dedupe o en el algoritmo de qty crearía compras duplicadas o
 * dejaría de avisar low-stock sin que nadie lo note. Cubre: scan crea PENDING
 * con la qty exacta, re-scan NO duplica, reposición → STALE, accept/reject.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Sugerencias de compra E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Crea un insumo con umbral y le pone `stock` unidades (conversionFactor 1). */
  const makeLowStockIngredient = async (name: string, threshold: number, stock: number) => {
    const ing = await request
      .post('/ingredients')
      .set(auth())
      .send({ name, unitPurchase: 'unidad', unitRecipe: 'unidad', conversionFactor: 1, thresholdMin: threshold })
      .expect(201);
    if (stock > 0) {
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ entityType: 'INGREDIENT', ingredientId: ing.body.id, delta: stock, type: 'INITIAL', unitCost: 100 })
        .expect(201);
    }
    return ing.body.id as string;
  };

  const scan = async () =>
    (await request.post('/purchase-suggestions/admin/scan').set(auth()).expect(201)).body as {
      createdCount: number;
      staledCount: number;
    };

  const suggestionsFor = async (ingredientId: string, status?: string) => {
    const q = status ? `?status=${status}` : '';
    const res = await request.get(`/purchase-suggestions${q}`).set(auth()).expect(200);
    return (res.body as Array<{ id: string; ingredientId: string | null; suggestedQty: number; status: string }>).filter(
      (s) => s.ingredientId === ingredientId,
    );
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'dueno-ps@test.local', fullName: 'Dueño PS', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    token = await loginAs(request, 'dueno-ps@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('el scan crea una sugerencia PENDING con la qty de refill a 2× umbral', async () => {
    const ingId = await makeLowStockIngredient('Insumo Bajo', 10, 3); // 3 < 10
    await scan();
    const rows = await suggestionsFor(ingId, 'PENDING');
    expect(rows).toHaveLength(1);
    // refill a 2×10=20; déficit 20−3=17; /factor 1 → ceil 17.
    expect(rows[0].suggestedQty).toBe(17);
  });

  it('re-escanear NO duplica la sugerencia abierta (dedupe)', async () => {
    const ingId = await makeLowStockIngredient('Insumo Dup', 8, 2);
    await scan();
    const r2 = await scan(); // segundo scan
    expect(r2.createdCount).toBe(0); // no crea nada nuevo (ya hay abierta para todos los bajos)
    expect(await suggestionsFor(ingId, 'PENDING')).toHaveLength(1);
  });

  it('reponer el stock por encima del umbral marca la sugerencia STALE', async () => {
    const ingId = await makeLowStockIngredient('Insumo Repone', 10, 4);
    await scan();
    expect(await suggestionsFor(ingId, 'PENDING')).toHaveLength(1);
    // Reponer +20 → stock 24 > 10 (MANUAL_ADJUSTMENT: PURCHASE va por facturas).
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'INGREDIENT', ingredientId: ingId, delta: 20, type: 'MANUAL_ADJUSTMENT', notes: 'repuse a mano' })
      .expect(201);
    const r = await scan();
    expect(r.staledCount).toBeGreaterThanOrEqual(1);
    expect(await suggestionsFor(ingId, 'PENDING')).toHaveLength(0);
    expect(await suggestionsFor(ingId, 'STALE')).toHaveLength(1);
  });

  it('aceptar y rechazar cambian el estado de la sugerencia', async () => {
    const acceptId = await makeLowStockIngredient('Insumo Aceptar', 10, 1);
    const rejectId = await makeLowStockIngredient('Insumo Rechazar', 10, 1);
    await scan();
    const a = (await suggestionsFor(acceptId, 'PENDING'))[0]!;
    const r = (await suggestionsFor(rejectId, 'PENDING'))[0]!;

    await request.post(`/purchase-suggestions/${a.id}/accept`).set(auth()).send({ note: 'compramos' }).expect(201);
    await request.post(`/purchase-suggestions/${r.id}/reject`).set(auth()).send({ note: 'hay de sobra' }).expect(201);

    expect((await suggestionsFor(acceptId, 'ACCEPTED'))).toHaveLength(1);
    expect((await suggestionsFor(rejectId, 'REJECTED'))).toHaveLength(1);
  });
});
