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
      failedCount: number;
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

  it('el scan sugiere exactamente lo que falta para llegar al mínimo', async () => {
    const ingId = await makeLowStockIngredient('Insumo Bajo', 10, 3); // 3 < 10
    await scan();
    const rows = await suggestionsFor(ingId, 'PENDING');
    expect(rows).toHaveLength(1);
    // Mínimo 10, hay 3 → faltan 7; factor 1 → 7. (Antes apuntaba a 2× el
    // mínimo y pedía 17: el doble de lo necesario.)
    expect(rows[0].suggestedQty).toBe(7);
  });

  it('un subproducto bajo mínimo no rompe el escaneo: se produce, no se compra', async () => {
    // Los subproductos no caben en purchase_suggestions (CHECK insumo xor
    // producto). Antes de saltarlos, uno solo bajo mínimo tumbaba el escaneo
    // entero con un 500 y la funcionalidad quedaba muerta.
    const sub = await prisma.subproduct.create({
      data: { name: 'Sub Bajo PS', unit: 'unidad', yield: 1, thresholdMin: 20, isActive: true },
    });
    const ingId = await makeLowStockIngredient('Insumo Junto Al Sub', 10, 1);

    const r = await scan();

    expect(r.failedCount).toBe(0);
    // El insumo que venía después del subproducto SÍ se registró.
    expect(await suggestionsFor(ingId, 'PENDING')).toHaveLength(1);
    const delSub = await prisma.purchaseSuggestion.count({
      where: { entityType: 'SUBPRODUCT' },
    });
    expect(delSub).toBe(0);
    await prisma.subproduct.delete({ where: { id: sub.id } });
  });

  it('aceptar una sugerencia la saca del listado y NO vuelve en el siguiente escaneo', async () => {
    // Antes, resolver no servía de nada: el escaneo de la hora siguiente veía
    // el stock todavía bajo (el pedido no ha llegado) y la creaba de nuevo.
    const ingId = await makeLowStockIngredient('Insumo Ya Pedido', 10, 2);
    await scan();
    const [sugg] = await suggestionsFor(ingId, 'PENDING');
    expect(sugg).toBeDefined();

    await request.post(`/purchase-suggestions/${sugg.id}/accept`).set(auth()).send({}).expect(201);

    const r = await scan();
    expect(r.createdCount).toBe(0);
    expect(await suggestionsFor(ingId, 'PENDING')).toHaveLength(0);
  });

  it('rechazar también se respeta: no reaparece en el siguiente escaneo', async () => {
    const ingId = await makeLowStockIngredient('Insumo No Comprar', 10, 1);
    await scan();
    const [sugg] = await suggestionsFor(ingId, 'PENDING');
    await request.post(`/purchase-suggestions/${sugg.id}/reject`).set(auth()).send({}).expect(201);

    await scan();
    expect(await suggestionsFor(ingId, 'PENDING')).toHaveLength(0);
  });

  it('dos personas resolviendo a la vez: solo una gana y la bitácora no se contradice', async () => {
    const ingId = await makeLowStockIngredient('Insumo Carrera', 10, 3);
    await scan();
    const [sugg] = await suggestionsFor(ingId, 'PENDING');

    const [a, b] = await Promise.all([
      request.post(`/purchase-suggestions/${sugg.id}/accept`).set(auth()).send({ note: 'la acepto' }),
      request.post(`/purchase-suggestions/${sugg.id}/reject`).set(auth()).send({ note: 'la rechazo' }),
    ]);

    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([201, 400]);

    const audits = await prisma.auditLog.count({
      where: {
        entityId: sugg.id,
        action: { in: ['PURCHASE_SUGGESTION_ACCEPTED', 'PURCHASE_SUGGESTION_REJECTED'] },
      },
    });
    expect(audits).toBe(1);
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
