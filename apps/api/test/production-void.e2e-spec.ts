/**
 * production-void.e2e-spec.ts
 *
 * Anular una tanda de producción mal registrada.
 *
 * La ley que ordena la suite: **anular tiene que dejar el inventario como si
 * esa tanda nunca se hubiera registrado**. Por eso los casos comparan contra el
 * estado ANTERIOR a producir y no contra un número escrito a mano — un número a
 * mano prueba que la cuenta da; comparar contra el antes prueba que no quedó
 * ruido en ningún lado.
 *
 * El caso que NO cuadra a propósito es el del subproducto ya vendido: ahí la
 * realidad es contradictoria (se vendió algo que decimos que no se produjo) y
 * el sistema tiene que dejarlo VISIBLE como stock negativo, no taparlo.
 */

import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { hoyLocal } from './helpers/local-day';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Receta: 1 porción de salsa consume 100 g de tomate (yield 10 → 1000 g/tanda). */
const YIELD = 10;
const GRAMOS_POR_TANDA = 1000;
const STOCK_INICIAL_G = 5000;
const COSTO_POR_GRAMO = 3;

describe('Producción — anular una tanda', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let adminToken: string;
  let cocineroToken: string;
  let tomateId: string;
  let salsaId: string;
  let platoId: string;

  const producir = async (cantidad = YIELD): Promise<string> => {
    const res = await request
      .post(`/subproducts/${salsaId}/produce`)
      .set(auth(duenoToken))
      .send({ quantityProduced: cantidad, idempotencyKey: randomUUID() })
      .expect(201);
    return res.body.runId as string;
  };

  const anular = (runId: string, token = duenoToken, reason = 'Se registró la tanda por error') =>
    request
      .post(`/subproducts/production/${runId}/void`)
      .set(auth(token))
      .send({ reason });

  const stockIngrediente = async (): Promise<number> => {
    const agg = await prisma.inventoryMovement.aggregate({
      where: { entityType: 'INGREDIENT', ingredientId: tomateId },
      _sum: { delta: true },
    });
    return Number(agg._sum.delta ?? 0);
  };

  const stockSubproducto = async (): Promise<number> => {
    const agg = await prisma.inventoryMovement.aggregate({
      where: { entityType: 'SUBPRODUCT', subproductId: salsaId },
      _sum: { delta: true },
    });
    return Number(agg._sum.delta ?? 0);
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    for (const [email, role, fullName] of [
      ['dueno-prodvoid@test.local', 'DUENO', 'Dueño Anula Tandas'],
      ['admin-prodvoid@test.local', 'ADMIN_OPERATIVO', 'Admin Anula Tandas'],
      ['cocinero-prodvoid@test.local', 'COCINERO', 'Cocinero Tandas'],
    ] as const) {
      await prisma.user.create({
        data: { email, fullName, role, passwordHash: hash, mustChangePwd: false, active: true },
      });
    }
    duenoToken = await loginAs(request, 'dueno-prodvoid@test.local');
    adminToken = await loginAs(request, 'admin-prodvoid@test.local');
    cocineroToken = await loginAs(request, 'cocinero-prodvoid@test.local');

    tomateId = (
      await request
        .post('/ingredients')
        .set(auth(duenoToken))
        .send({ name: 'Tomate Tanda', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000 })
        .expect(201)
    ).body.id;

    salsaId = (
      await request
        .post('/subproducts')
        .set(auth(duenoToken))
        .send({ name: 'Salsa Tanda', yield: YIELD, unit: 'porción' })
        .expect(201)
    ).body.id;

    await request
      .put(`/subproducts/${salsaId}/recipe`)
      .set(auth(duenoToken))
      .send({ edges: [{ childType: 'ingredient', childId: tomateId, quantityNeta: GRAMOS_POR_TANDA }] })
      .expect(200);

    await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        type: 'INITIAL',
        entityType: 'INGREDIENT',
        ingredientId: tomateId,
        delta: STOCK_INICIAL_G,
        unitCost: COSTO_POR_GRAMO,
      })
      .expect(201);

    // Un plato que consume 1 porción de salsa: para el caso de anular una
    // tanda cuyo subproducto ya se vendió.
    platoId = (
      await request
        .post('/products')
        .set(auth(duenoToken))
        .send({
          name: 'Plato Tanda',
          category: 'Test',
          basePrice: 12000,
          directResale: false,
          isCombo: false,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id;

    await request
      .put(`/products/${platoId}/recipe`)
      .set(auth(duenoToken))
      .send({ edges: [{ childType: 'subproduct', childId: salsaId, quantityNeta: 1 }] })
      .expect(200);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // =====================================================================
  // El inventario vuelve a donde estaba
  // =====================================================================

  it('devuelve el insumo y deshace el subproducto', async () => {
    const insumoAntes = await stockIngrediente();
    const subAntes = await stockSubproducto();

    const runId = await producir();
    expect(await stockIngrediente()).toBe(insumoAntes - GRAMOS_POR_TANDA);
    expect(await stockSubproducto()).toBe(subAntes + YIELD);

    await anular(runId).expect(204);
    expect(await stockIngrediente()).toBe(insumoAntes);
    expect(await stockSubproducto()).toBe(subAntes);
  });

  it('escribe un compensatorio por línea, con la FECHA del original', async () => {
    const runId = await producir();
    const originales = await prisma.inventoryMovement.findMany({
      where: { sourceType: 'production', sourceId: runId },
      orderBy: { delta: 'asc' },
    });
    expect(originales.length).toBe(2);

    await anular(runId).expect(204);

    const reversas = await prisma.inventoryMovement.findMany({
      where: { sourceType: 'production_reversal', sourceId: runId },
      orderBy: { delta: 'asc' },
    });
    expect(reversas.length).toBe(originales.length);
    // Cada compensatorio invierte el signo del suyo y comparte su fecha: es lo
    // que hace que el motor recalcule todo como si la tanda no hubiera existido.
    for (const original of originales) {
      const par = reversas.find(
        (r) =>
          r.entityType === original.entityType &&
          r.ingredientId === original.ingredientId &&
          r.subproductId === original.subproductId,
      );
      expect(par).toBeDefined();
      expect(Number(par!.delta)).toBe(-Number(original.delta));
      expect(par!.createdAt.toISOString()).toBe(original.createdAt.toISOString());
      // PRODUCTION a propósito: el reporte de uso la netea contra lo producido.
      expect(par!.type).toBe('PRODUCTION');
    }
  });

  it('el insumo vuelve a su LOTE, no como mercancía sin costo', async () => {
    const runId = await producir();
    await anular(runId).expect(204);

    const valuacion = await request
      .get('/reports/cogs/inventory-valuation')
      .set(auth(duenoToken))
      .expect(200);
    const fila = (
      valuacion.body.items as Array<{ id: string; qty: number; value: number; unknownQty: number }>
    ).find((r) => r.id === tomateId);
    // Si el insumo hubiera vuelto como lote nuevo sin costo, estas unidades
    // aparecerían como desconocidas y el inventario valdría de menos.
    expect(fila).toBeDefined();
    expect(fila!.unknownQty).toBe(0);
    expect(fila!.value).toBe(fila!.qty * COSTO_POR_GRAMO);
  });

  // =====================================================================
  // Quién puede
  // =====================================================================

  it('el admin operativo puede anular', async () => {
    const runId = await producir();
    await anular(runId, adminToken).expect(204);
  });

  it('el cocinero NO puede anular (registra, no revierte)', async () => {
    const runId = await producir();
    await anular(runId, cocineroToken).expect(403);
    // Y la tanda sigue en pie.
    const reversas = await prisma.inventoryMovement.count({
      where: { sourceType: 'production_reversal', sourceId: runId },
    });
    expect(reversas).toBe(0);
    await anular(runId).expect(204);
  });

  it('el cocinero tampoco puede ver el efecto de anular', async () => {
    const runId = await producir();
    await request
      .get(`/subproducts/production/${runId}/void-preview`)
      .set(auth(cocineroToken))
      .expect(403);
    await anular(runId).expect(204);
  });

  // =====================================================================
  // Lo que rechaza
  // =====================================================================

  it('no se puede anular dos veces', async () => {
    const runId = await producir();
    await anular(runId).expect(204);
    const segunda = await anular(runId).expect(400);
    expect(String(segunda.body.message)).toContain('ya está anulada');

    // Y el inventario no se movió una segunda vez.
    const reversas = await prisma.inventoryMovement.count({
      where: { sourceType: 'production_reversal', sourceId: runId },
    });
    expect(reversas).toBe(2);
  });

  it('dos anulaciones a la vez devuelven el insumo UNA sola vez', async () => {
    const runId = await producir();
    const antes = await stockIngrediente();

    // Con 2 peticiones la carrera casi nunca se reproduce: se mandan 6.
    const respuestas = await Promise.all(Array.from({ length: 6 }, () => anular(runId)));
    expect(respuestas.filter((r) => r.status === 204).length).toBe(1);

    expect(await stockIngrediente()).toBe(antes + GRAMOS_POR_TANDA);
    const reversas = await prisma.inventoryMovement.count({
      where: { sourceType: 'production_reversal', sourceId: runId },
    });
    expect(reversas).toBe(2);
  });

  it('una tanda que no existe da 404', async () => {
    await anular(randomUUID()).expect(404);
  });

  it('exige un motivo entendible', async () => {
    const runId = await producir();
    await request
      .post(`/subproducts/production/${runId}/void`)
      .set(auth(duenoToken))
      .send({ reason: 'no' })
      .expect(400);
    await anular(runId).expect(204);
  });

  it('no se puede anular una tanda de hace más de 3 días', async () => {
    // `inventory_movements` es insert-only (trigger): una tanda vieja no se
    // fabrica envejeciendo una nueva, se INSERTA con su fecha.
    const runId = randomUUID();
    const haceCuatroDias = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await prisma.inventoryMovement.createMany({
      data: [
        {
          entityType: 'INGREDIENT',
          ingredientId: tomateId,
          delta: -GRAMOS_POR_TANDA,
          type: 'PRODUCTION',
          sourceType: 'production',
          sourceId: runId,
          createdAt: haceCuatroDias,
        },
        {
          entityType: 'SUBPRODUCT',
          subproductId: salsaId,
          delta: YIELD,
          type: 'PRODUCTION',
          sourceType: 'production',
          sourceId: runId,
          createdAt: haceCuatroDias,
        },
      ],
    });

    const res = await anular(runId).expect(400);
    expect(String(res.body.message)).toContain('3 días');
    // Y el motivo se explica también antes de intentarlo.
    const previa = await request
      .get(`/subproducts/production/${runId}/void-preview`)
      .set(auth(duenoToken))
      .expect(200);
    expect(String(previa.body.blockedReason)).toContain('3 días');
    expect(previa.body.daysLeft).toBe(0);
  });

  // =====================================================================
  // El efecto se puede consultar ANTES de decidir
  // =====================================================================

  it('el efecto que muestra la vista previa es el que ocurre', async () => {
    const runId = await producir();
    const previa = await request
      .get(`/subproducts/production/${runId}/void-preview`)
      .set(auth(duenoToken))
      .expect(200);

    expect(previa.body.blockedReason).toBeNull();
    const porItem = new Map(
      (previa.body.lines as Array<{ entityId: string; resultingStock: number }>).map((l) => [
        l.entityId,
        l.resultingStock,
      ]),
    );
    await anular(runId).expect(204);

    expect(await stockIngrediente()).toBe(porItem.get(tomateId));
    expect(await stockSubproducto()).toBe(porItem.get(salsaId));
  });

  it('la vista previa de una tanda ya anulada explica por qué no se puede', async () => {
    const runId = await producir();
    await anular(runId).expect(204);

    const previa = await request
      .get(`/subproducts/production/${runId}/void-preview`)
      .set(auth(duenoToken))
      .expect(200);
    expect(String(previa.body.blockedReason)).toContain('ya está anulada');
    expect(previa.body.lines).toEqual([]);
  });

  // =====================================================================
  // Rastro
  // =====================================================================

  it('deja el motivo en la bitácora y en las notas del movimiento', async () => {
    const runId = await producir();
    await anular(runId, duenoToken, 'Se registraron 10 porciones en vez de 1').expect(204);

    const evento = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'SUBPRODUCT_PRODUCTION_VOIDED', entityId: runId },
    });
    const meta = evento.metadata as Record<string, unknown>;
    expect(meta.reason).toBe('Se registraron 10 porciones en vez de 1');
    expect(meta.subproductId).toBe(salsaId);
    expect(meta.quantityProduced).toBe(YIELD);

    const reversa = await prisma.inventoryMovement.findFirstOrThrow({
      where: { sourceType: 'production_reversal', sourceId: runId, entityType: 'SUBPRODUCT' },
    });
    expect(reversa.notes).toContain('Se registraron 10 porciones en vez de 1');
  });

  // =====================================================================
  // El caso incómodo: ya se vendió lo que la tanda produjo
  // =====================================================================

  it('anular una tanda ya vendida deja el subproducto DEBIENDO, no en cero', async () => {
    const insumoAntes = await stockIngrediente();
    const subAntes = await stockSubproducto();
    const runId = await producir();
    await request.post('/shifts/open').set(auth(duenoToken)).send({ openingCash: 0 }).expect(201);

    // Se vende TODA la salsa disponible: así anular la tanda deja al
    // subproducto realmente debiendo, que es el caso que interesa.
    const porcionesVendidas = subAntes + YIELD;
    const venta = await request
      .post('/sales')
      .set(auth(duenoToken))
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: platoId, quantity: porcionesVendidas }] })
      .expect(201);
    await request
      .post(`/sales/${venta.body.id}/confirm-payment`)
      .set(auth(duenoToken))
      .send({ method: 'CASH', amountReceived: Number(venta.body.total) })
      .expect(201);

    expect(await stockSubproducto()).toBe(0);

    // La vista previa avisa ANTES: esto es lo que la caja va a frenar hoy.
    const previa = await request
      .get(`/subproducts/production/${runId}/void-preview`)
      .set(auth(duenoToken))
      .expect(200);
    expect(previa.body.goesNegative).toContain('Salsa Tanda');

    await anular(runId, duenoToken, 'La tanda se registró por error, no se hizo').expect(204);

    // Se vendieron porciones que ahora decimos que nunca se produjeron: el
    // subproducto queda DEBIENDO las de esta tanda. Es a propósito — la
    // contradicción tiene que verse, no taparse; la próxima tanda real la salda.
    expect(await stockSubproducto()).toBe(-YIELD);
    // Y el insumo volvió entero: la venta consumió salsa, no tomate.
    expect(await stockIngrediente()).toBe(insumoAntes);
  });

  it('la tanda sigue en el hub de cocina, marcada como anulada', async () => {
    const runId = await producir();
    await anular(runId, duenoToken, 'La cocina la registró dos veces').expect(204);

    const hoy = hoyLocal();
    const res = await request
      .get(`/kitchen/productions?from=${hoy}&to=${hoy}`)
      .set(auth(duenoToken))
      .expect(200);

    const fila = (res.body as Array<{ runId: string; voidedAt: string | null; voidReason: string | null }>)
      .find((r) => r.runId === runId);
    // Sigue en la lista —el registro existió— pero nadie puede confundirla con
    // producción vigente.
    expect(fila).toBeDefined();
    expect(fila!.voidedAt).not.toBeNull();
    expect(fila!.voidReason).toBe('La cocina la registró dos veces');
  });
});
