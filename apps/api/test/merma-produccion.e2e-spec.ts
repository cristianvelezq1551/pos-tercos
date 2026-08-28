/**
 * E2E del escenario real de la ensalada: merma de receta + merma extra.
 *
 * Verifica de punta a punta que la plata NO se pierde ni se inventa:
 *   compra = consumido por producción + mermado + lo que queda en inventario.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// --- Datos del escenario ---
const COSTO_POR_GRAMO = 2;          // repollo a $2.000/kg
const STOCK_INICIAL_G = 20_000;     // 20 kg
const NETO_POR_TANDA_G = 2_000;     // lo que queda limpio en la ensalada
const MERMA_RECETA = 0.10;          // 10% se pierde normalmente (corazón)
const YIELD = 20;                   // una tanda rinde 20 porciones

// Lo que el sistema DEBE descontar por tanda: 2000 / 0,90
const BRUTO_ESPERADO_G = NETO_POR_TANDA_G / (1 - MERMA_RECETA); // 2222,2222
// Día malo: se perdió 35% en vez de 10%. Bruto real = 2000 / 0,65
const BRUTO_REAL_G = NETO_POR_TANDA_G / 0.65;                    // 3076,9231
// Lo que se registra como merma = solo el exceso sobre lo ya descontado
const MERMA_EXTRA_G = BRUTO_REAL_G - BRUTO_ESPERADO_G;           // 854,7009

const PORCIONES_MERMADAS = 5;
// Cada porción cuesta lo que costó la tanda dividido su rendimiento.
const COSTO_PORCION = (BRUTO_ESPERADO_G * COSTO_POR_GRAMO) / YIELD;
const MERMA_REPOLLO_$ = MERMA_EXTRA_G * COSTO_POR_GRAMO;
const MERMA_ENSALADA_$ = COSTO_PORCION * PORCIONES_MERMADAS;

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) < tol;

describe('Merma en producción de subproducto (escenario ensalada)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let repolloId: string;
  let ensaladaId: string;
  let mermaMovementId: string;
  let runBody: { consumed: { entityId: string; quantityConsumed: number }[] };

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const hoy = () => new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-merma@test.local', fullName: 'Dueño Merma', role: 'DUENO',
        passwordHash: hash, mustChangePwd: false, active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-merma@test.local');

    repolloId = (await request.post('/ingredients').set(auth(duenoToken)).send({
      name: 'Repollo', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000,
    }).expect(201)).body.id;

    ensaladaId = (await request.post('/subproducts').set(auth(duenoToken)).send({
      name: 'Ensalada', yield: YIELD, unit: 'porción',
    }).expect(201)).body.id;

    await request.put(`/subproducts/${ensaladaId}/recipe`).set(auth(duenoToken)).send({
      edges: [{
        childType: 'ingredient', childId: repolloId,
        quantityNeta: NETO_POR_TANDA_G, mermaPct: MERMA_RECETA,
      }],
    }).expect(200);

    // Compra: 20 kg a $2/g = $40.000
    await request.post('/inventory/movements').set(auth(duenoToken)).send({
      type: 'INITIAL', entityType: 'INGREDIENT', ingredientId: repolloId,
      delta: STOCK_INICIAL_G, unitCost: COSTO_POR_GRAMO,
    }).expect(201);

    // --- Todas las ESCRITURAS van acá ---
    // El ledger FIFO se sirve de una caché de 60 s, así que cualquier
    // movimiento posterior a la primera lectura de reportes no se vería.
    const uploadPhoto = async (): Promise<string> =>
      (await request.post('/kitchen/evidence').set(auth(duenoToken))
        .attach('photo', PNG_1X1, { filename: 'm.png', contentType: 'image/png' })
        .expect(201)).body.key;

    runBody = (await request.post(`/subproducts/${ensaladaId}/produce`)
      .set(auth(duenoToken))
      .send({ quantityProduced: YIELD, idempotencyKey: randomUUID() })
      .expect(201)).body;

    await request.post('/kitchen/waste').set(auth(duenoToken)).send({
      entityType: 'INGREDIENT', ingredientId: repolloId,
      quantity: MERMA_EXTRA_G, reason: 'repollo podrido del proveedor, se perdió 35%',
      evidenceKey: await uploadPhoto(), idempotencyKey: randomUUID(),
    }).expect(201);

    // Se dañan 5 de las 20 porciones ya hechas.
    await request.post('/kitchen/waste').set(auth(duenoToken)).send({
      entityType: 'SUBPRODUCT', subproductId: ensaladaId, quantity: PORCIONES_MERMADAS,
      reason: 'la tanda se quedó fuera de la nevera',
      evidenceKey: await uploadPhoto(), idempotencyKey: randomUUID(),
    }).expect(201);

    mermaMovementId = (await prisma.inventoryMovement.findFirstOrThrow({
      where: { type: 'WASTE', ingredientId: repolloId },
    })).id;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('1. la producción descuenta el BRUTO (neto / (1 - merma)), no el neto', () => {
    const consumido = runBody.consumed.find((c) => c.entityId === repolloId)!;
    expect(near(consumido.quantityConsumed, BRUTO_ESPERADO_G)).toBe(true);
    expect(consumido.quantityConsumed).toBeGreaterThan(NETO_POR_TANDA_G); // la merma SÍ se aplica
  });

  it('2. la merma extra queda con foto y deja el stock en lo realmente usado', async () => {
    const mv = await prisma.inventoryMovement.findUniqueOrThrow({
      where: { id: mermaMovementId },
    });
    expect(near(Number(mv.delta), -MERMA_EXTRA_G)).toBe(true);
    expect(mv.evidenceKey).not.toBeNull();

    const stock = await request.get(`/inventory/stock/ingredient/${repolloId}`)
      .set(auth(duenoToken)).expect(200);
    expect(near(stock.body.currentStock, STOCK_INICIAL_G - BRUTO_REAL_G)).toBe(true);

    const ensalada = await request.get(`/inventory/stock/subproduct/${ensaladaId}`)
      .set(auth(duenoToken)).expect(200);
    expect(ensalada.body.currentStock).toBe(YIELD - PORCIONES_MERMADAS);
  });

  it('3. el P&G cobra la merma al costo REAL del lote (FIFO)', async () => {
    const pnl = await request.get(`/reports/cogs/pnl?from=${hoy()}&to=${hoy()}`)
      .set(auth(duenoToken)).expect(200);
    expect(near(pnl.body.wasteCost, MERMA_REPOLLO_$ + MERMA_ENSALADA_$, 1)).toBe(true);
    expect(pnl.body.wasteEstimatedCost).toBe(0); // había lote real: nada estimado
  });

  it('4. LEY DE CONSERVACIÓN: compra = inventario restante + merma', async () => {
    const val = await request.get('/reports/cogs/inventory-valuation')
      .set(auth(duenoToken)).expect(200);
    const pnl = await request.get(`/reports/cogs/pnl?from=${hoy()}&to=${hoy()}`)
      .set(auth(duenoToken)).expect(200);

    const compra = STOCK_INICIAL_G * COSTO_POR_GRAMO; // $40.000
    console.log('[VALORES] inventario=', val.body.totalValue,
      'merma$=', pnl.body.wasteCost, 'suma=', val.body.totalValue + pnl.body.wasteCost,
      'compra=', compra, 'desconocido=', val.body.totalUnknownQty);
    for (const i of val.body.items) console.log('  lote:', i.name, i.qty, '=> $', i.value);

    expect(near(val.body.totalValue + pnl.body.wasteCost, compra, 1)).toBe(true);
    expect(val.body.totalUnknownQty).toBe(0);
    // El valor del repollo consumido NO se evaporó: vive en el lote de ensalada.
    const ens = val.body.items.find((r: { id: string }) => r.id === ensaladaId);
    expect(near(ens.value, COSTO_PORCION * (YIELD - PORCIONES_MERMADAS), 1)).toBe(true);
  });

  it('5. el reporte de uso separa lo consumido por receta de lo mermado', async () => {
    const usage = await request.get(`/reports/inventory-usage?from=${hoy()}&to=${hoy()}`)
      .set(auth(duenoToken)).expect(200);
    const row = usage.body.rows.find((r: { entityId: string }) => r.entityId === repolloId);
    expect(near(row.productionOut, BRUTO_ESPERADO_G)).toBe(true);
    expect(near(row.waste, MERMA_EXTRA_G)).toBe(true);
    console.log('[USO sin factura] waste=', row.waste, 'producido=', row.productionOut,
      'wasteCost=', row.wasteCost, '| esperado $', MERMA_REPOLLO_$);
    // Las CANTIDADES separan bien lo consumido por receta de lo mermado.
    expect(near(row.productionOut, BRUTO_ESPERADO_G)).toBe(true);
    expect(near(row.waste, MERMA_EXTRA_G)).toBe(true);
    // El costo sale del ledger, así que NO depende de que haya factura:
    // sin `lastUnitCost` el reporte igual sabe cuánto costó lo que se tiró.
    expect(near(row.wasteCost, MERMA_REPOLLO_$, 1)).toBe(true);
    expect(row.wasteCostEstimated).toBe(false);
    expect(row.shortageQty).toBe(0);
  });

  it('5b. el $ de la merma NO se mueve aunque cambie el precio de compra', async () => {
    // Llega una compra POSTERIOR más cara ($3.000/kg). Lo que se tiró salió del
    // lote viejo a $2/g: el reporte debe seguir diciendo lo mismo que el P&G.
    await prisma.ingredient.update({
      where: { id: repolloId },
      data: { lastUnitCost: 3000, lastUnitCostDate: new Date() },
    });
    const usage = await request.get(`/reports/inventory-usage?from=${hoy()}&to=${hoy()}`)
      .set(auth(duenoToken)).expect(200);
    const row = usage.body.rows.find((r: { entityId: string }) => r.entityId === repolloId);
    const pnl = await request.get(`/reports/cogs/pnl?from=${hoy()}&to=${hoy()}`)
      .set(auth(duenoToken)).expect(200);

    console.log('[COINCIDENCIA] repollo $', row.wasteCost,
      '| total uso $', usage.body.totalWasteCost, '| P&G $', pnl.body.wasteCost);
    // El precio de compra subió 50%, pero se tiró del lote viejo: no se mueve.
    expect(near(row.wasteCost, MERMA_REPOLLO_$, 1)).toBe(true);
    // LA LEY: el total del reporte es el MISMO número que la línea del P&G.
    expect(near(usage.body.totalWasteCost, pnl.body.wasteCost, 1)).toBe(true);
  });

  it('5c. un SUBPRODUCTO mermado también se valoriza (antes quedaba en blanco)', async () => {
    const usage = await request.get(`/reports/inventory-usage?from=${hoy()}&to=${hoy()}`)
      .set(auth(duenoToken)).expect(200);
    const row = usage.body.rows.find((r: { entityId: string }) => r.entityId === ensaladaId);
    console.log('[SUBPRODUCTO]', PORCIONES_MERMADAS, 'porciones => $', row.wasteCost,
      '| esperado $', MERMA_ENSALADA_$);
    // Su costo NO sale de una factura (un subproducto no se compra): sale de lo
    // que costó producirlo. Antes esta celda quedaba siempre vacía.
    expect(row.waste).toBe(PORCIONES_MERMADAS);
    expect(near(row.wasteCost, MERMA_ENSALADA_$, 1)).toBe(true);
    expect(row.unitCost).toBeNull(); // no hay precio de compra, y aun así se valoriza
  });

  it('6. anular la merma devuelve el stock Y borra el gasto del P&G', async () => {
    await request.post(`/inventory/movements/${mermaMovementId}/reverse-waste`)
      .set(auth(duenoToken)).send({ reason: 'me equivoqué de cantidad' }).expect(201);

    const stock = await request.get(`/inventory/stock/ingredient/${repolloId}`)
      .set(auth(duenoToken)).expect(200);
    expect(near(stock.body.currentStock, STOCK_INICIAL_G - BRUTO_ESPERADO_G)).toBe(true);

    // El costo sale del P&G al vencer el TTL de 60 s del ledger (verificado
    // aparte; no se espera acá para no volver lenta la suite).
    const quedaSinAnular = await prisma.inventoryMovement.aggregate({
      where: { sourceType: 'waste_reversal', sourceId: mermaMovementId },
      _sum: { delta: true },
    });
    expect(near(Number(quedaSinAnular._sum.delta ?? 0), MERMA_EXTRA_G)).toBe(true);

    // No se puede devolver dos veces lo mismo.
    await request.post(`/inventory/movements/${mermaMovementId}/reverse-waste`)
      .set(auth(duenoToken)).send({ reason: 'intento duplicado' }).expect(400);
  });
});
