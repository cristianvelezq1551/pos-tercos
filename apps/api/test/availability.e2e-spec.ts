/**
 * availability.e2e-spec.ts
 *
 * Disponibilidad en vivo robusta:
 *   - preparado con receta → se invalida si falta stock de un insumo
 *   - reventa directa → se invalida sin stock propio
 *   - "86" manual (soldOut) invalida cualquier producto
 *   - producto sin receta → no se invalida (fallback conservador)
 */

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

  const fetchAvailability = async (): Promise<Map<string, AvailabilityRow>> => {
    const res = await request.get('/products/availability').expect(200);
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
});
