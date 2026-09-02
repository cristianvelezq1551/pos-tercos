/**
 * availability.e2e-spec.ts
 *
 * Disponibilidad en vivo robusta:
 *   - preparado con receta → se invalida si falta stock de un insumo
 *   - reventa directa → se invalida sin stock propio
 *   - "86" manual (soldOut) invalida cualquier producto
 *   - producto sin receta → no se invalida (fallback conservador)
 */

import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

interface AvailabilityRow {
  productId: string;
  available: boolean;
  stock: number | null;
  reason: string | null;
}

describe('Availability E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let adminToken: string;

  let panId: string;
  let burgerId: string; // preparado con receta (1 Pan)
  let aguaId: string; // reventa directa
  let soloId: string; // preparado sin receta

  // La lógica de disponibilidad (stock/reason) se valida contra el endpoint
  // INTERNO (cajero) — el público devuelve stock/reason en null por seguridad.
  const fetchAvailability = async (): Promise<Map<string, AvailabilityRow>> => {
    const res = await request
      .get('/products/availability/internal')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return new Map((res.body as AvailabilityRow[]).map((r) => [r.productId, r]));
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-avail@test.local',
        fullName: 'Dueño Avail',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    adminToken = await loginAs(request, 'dueno-avail@test.local');

    // Insumo: Pan (arranca en 0 de stock)
    const panRes = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Pan E2E',
        unitPurchase: 'paquete',
        unitRecipe: 'unidad',
        conversionFactor: 1,
      })
      .expect(201);
    panId = panRes.body.id as string;

    // Preparado con receta: Hamburguesa → 1 Pan
    const burgerRes = await request
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Hamburguesa E2E',
        category: 'Test',
        basePrice: 15000,
        isActive: true,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
      })
      .expect(201);
    burgerId = burgerRes.body.id as string;

    await request
      .put(`/products/${burgerId}/recipe`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ edges: [{ childType: 'ingredient', childId: panId, quantityNeta: 1 }] })
      .expect(200);

    // Reventa directa: Agua (arranca en 0 de stock)
    const aguaRes = await request
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Agua E2E',
        category: 'Test',
        basePrice: 3000,
        isActive: true,
        directResale: true,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'caja',
        unitStock: 'unidad',
        conversionFactor: 12,
        thresholdMin: 0,
      })
      .expect(201);
    aguaId = aguaRes.body.id as string;

    // Preparado SIN receta
    const soloRes = await request
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Solo Sin Receta E2E',
        category: 'Test',
        basePrice: 5000,
        isActive: true,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
      })
      .expect(201);
    soloId = soloRes.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('el endpoint PÚBLICO no filtra stock ni motivo (solo available)', async () => {
    // Sin auth: cualquiera en internet. No debe ver stock exacto ni "Sin Pan…".
    const res = await request.get('/products/availability').expect(200);
    const rows = res.body as AvailabilityRow[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.stock).toBeNull();
      expect(r.reason).toBeNull();
      expect(typeof r.available).toBe('boolean');
    }
  });

  it('preparado con insumo en 0 → no disponible, motivo nombra el insumo', async () => {
    const map = await fetchAvailability();
    const burger = map.get(burgerId);
    expect(burger).toBeDefined();
    expect(burger?.available).toBe(false);
    expect(burger?.reason).toContain('Pan');
  });

  it('reventa directa sin stock → no disponible, motivo "Sin stock"', async () => {
    const map = await fetchAvailability();
    const agua = map.get(aguaId);
    expect(agua?.available).toBe(false);
    expect(agua?.stock).toBe(0);
    expect(agua?.reason).toBe('Sin stock');
  });

  it('preparado sin receta → disponible (fallback conservador)', async () => {
    const map = await fetchAvailability();
    const solo = map.get(soloId);
    expect(solo?.available).toBe(true);
    expect(solo?.reason).toBeNull();
  });

  it('al reponer el insumo, el preparado vuelve a estar disponible', async () => {
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ entityType: 'INGREDIENT', ingredientId: panId, delta: 5, type: 'INITIAL' })
      .expect(201);

    const map = await fetchAvailability();
    const burger = map.get(burgerId);
    expect(burger?.available).toBe(true);
    expect(burger?.reason).toBeNull();
  });

  it('al reponer la reventa directa, queda disponible con stock', async () => {
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ entityType: 'PRODUCT', productId: aguaId, delta: 24, type: 'INITIAL' })
      .expect(201);

    const map = await fetchAvailability();
    const agua = map.get(aguaId);
    expect(agua?.available).toBe(true);
    expect(agua?.stock).toBe(24);
    expect(agua?.reason).toBeNull();
  });

  it('"86" manual invalida un preparado aunque tenga insumos', async () => {
    await request
      .post(`/products/${burgerId}/sold-out`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ soldOut: true })
      .expect(201);

    const map = await fetchAvailability();
    const burger = map.get(burgerId);
    expect(burger?.available).toBe(false);
    expect(burger?.reason).toBe('Agotado (manual)');

    // Revertir el 86 → vuelve a disponible.
    await request
      .post(`/products/${burgerId}/sold-out`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ soldOut: false })
      .expect(201);

    const map2 = await fetchAvailability();
    expect(map2.get(burgerId)?.available).toBe(true);
  });

  describe('un plato con variantes se ofrece si al menos una se puede hacer', () => {
    let platoId: string;
    let conPolloId: string;
    let conCarneId: string;
    let polloId: string;
    let carneId: string;

    const disponibilidad = async () => {
      const res = await request
        .get('/products/availability/internal')
        .set({ Authorization: `Bearer ${adminToken}` })
        .expect(200);
      const fila = (
        res.body as Array<{
          productId: string;
          available: boolean;
          reason: string | null;
          variants?: Array<{ sizeId: string; name: string; available: boolean; reason: string | null }>;
        }>
      ).find((r) => r.productId === platoId);
      expect(fila).toBeDefined();
      return fila!;
    };
    // Reponer suma; sacar se hace como en la vida real, con una merma.
    const mover = async (ingredientId: string, delta: number) => {
      await request
        .post('/inventory/movements')
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({
          entityType: 'INGREDIENT',
          ingredientId,
          delta,
          type: delta >= 0 ? 'MANUAL_ADJUSTMENT' : 'WASTE',
          notes: delta >= 0 ? 'reposición de prueba' : 'se acabó',
        })
        .expect(201);
    };

    beforeAll(async () => {
      const ing = async (name: string) =>
        (
          await request
            .post('/ingredients')
            .set({ Authorization: `Bearer ${adminToken}` })
            .send({ name: `${name} ${randomUUID().slice(0, 6)}`, unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000 })
            .expect(201)
        ).body.id as string;
      polloId = await ing('Pollo AV');
      carneId = await ing('Carne AV');

      const creado = await request
        .post('/products')
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({
          category: 'Test',
          name: `Plato variantes ${randomUUID().slice(0, 6)}`,
          basePrice: 25000,
          directResale: false,
          isCombo: false,
          modifiersEnabled: false,
          sizes: [
            { name: 'Con pollo', priceModifier: 0, sortOrder: 0 },
            { name: 'Con carne', priceModifier: 3000, sortOrder: 1 },
          ],
        })
        .expect(201);
      platoId = creado.body.id as string;
      const tam = creado.body.sizes as Array<{ id: string; name: string }>;
      conPolloId = tam.find((t) => t.name === 'Con pollo')!.id;
      conCarneId = tam.find((t) => t.name === 'Con carne')!.id;

      // Base: el mismo pan de la suite. Cada variante suma su proteína.
      await request
        .put(`/products/${platoId}/recipe`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({ edges: [{ childType: 'ingredient', childId: panId, quantityNeta: 1 }] })
        .expect(200);
      for (const [sizeId, ingredientId] of [
        [conPolloId, polloId],
        [conCarneId, carneId],
      ] as const) {
        await request
          .put(`/products/${platoId}/sizes/${sizeId}/recipe`)
          .set({ Authorization: `Bearer ${adminToken}` })
          .send({ edges: [{ childType: 'ingredient', childId: ingredientId, quantityNeta: 100 }] })
          .expect(200);
      }
      // Hay pollo, NO hay carne.
      await mover(polloId, 1000);
      // Vender exige caja abierta; puede haberla ya de otra parte de la suite.
      const actual = await request
        .get('/shifts/current')
        .set({ Authorization: `Bearer ${adminToken}` });
      if (actual.status !== 200 || !actual.body?.id) {
        await request
          .post('/shifts/open')
          .set({ Authorization: `Bearer ${adminToken}` })
          .send({ openingCash: 0 })
          .expect(201);
      }
    });

    it('con una sola proteína, el plato se ofrece y la otra opción queda bloqueada', async () => {
      const fila = await disponibilidad();
      expect(fila.available).toBe(true);
      const porId = new Map((fila.variants ?? []).map((v) => [v.sizeId, v]));
      expect(porId.get(conPolloId)?.available).toBe(true);
      expect(porId.get(conCarneId)?.available).toBe(false);
      expect(porId.get(conCarneId)?.reason).toContain('Carne');
    });

    it('el cobro de la variante que SÍ hay funciona', async () => {
      const venta = await request
        .post('/sales')
        .set({ Authorization: `Bearer ${adminToken}` })
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId: platoId, sizeId: conPolloId, quantity: 1 }] })
        .expect(201);
      await request
        .post(`/sales/${venta.body.id}/confirm-payment`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({ method: 'CASH', amountReceived: venta.body.total })
        .expect(201);
    });

    it('el de la que NO hay lo sigue rechazando el guard, que es la red final', async () => {
      const venta = await request
        .post('/sales')
        .set({ Authorization: `Bearer ${adminToken}` })
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId: platoId, sizeId: conCarneId, quantity: 1 }] })
        .expect(201);
      await request
        .post(`/sales/${venta.body.id}/confirm-payment`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({ method: 'CASH', amountReceived: venta.body.total })
        .expect(409);
    });

    it('sin ninguna proteína el plato deja de ofrecerse, y dice TODO lo que falta', async () => {
      await mover(polloId, -1000);
      const fila = await disponibilidad();
      expect(fila.available).toBe(false);
      expect(fila.reason).toContain('Pollo');
      expect(fila.reason).toContain('Carne');
    });

    it('al reponer una proteína, el plato vuelve — no hay que reponer las dos', async () => {
      await mover(carneId, 1000);
      const fila = await disponibilidad();
      expect(fila.available).toBe(true);
      const porId = new Map((fila.variants ?? []).map((v) => [v.sizeId, v]));
      expect(porId.get(conCarneId)?.available).toBe(true);
      expect(porId.get(conPolloId)?.available).toBe(false);
    });

    it('el endpoint PÚBLICO dice qué variante no se puede, pero NO por qué', async () => {
      const res = await request.get('/products/availability').expect(200);
      const fila = (
        res.body as Array<{
          productId: string;
          variants?: Array<{ sizeId: string; available: boolean; reason: string | null }>;
        }>
      ).find((r) => r.productId === platoId);
      const porId = new Map((fila?.variants ?? []).map((v) => [v.sizeId, v]));
      // Al cliente le sirve saber que no se puede elegir; qué insumo falta, no.
      expect(porId.get(conPolloId)?.available).toBe(false);
      expect(porId.get(conPolloId)?.reason).toBeNull();
      expect(porId.get(conCarneId)?.available).toBe(true);
    });

    it('un producto sin variantes no trae ninguna', async () => {
      const res = await request
        .get('/products/availability/internal')
        .set({ Authorization: `Bearer ${adminToken}` })
        .expect(200);
      const burger = (res.body as Array<{ productId: string; variants?: unknown[] }>).find(
        (r) => r.productId === burgerId,
      );
      expect(burger?.variants ?? []).toEqual([]);
    });
  });

});
