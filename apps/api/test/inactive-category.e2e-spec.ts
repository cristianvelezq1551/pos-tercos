/**
 * inactive-category.e2e-spec.ts
 *
 * Regresión del toggle "Activa/Inactiva" de categorías (novedad de ensayo
 * 2026-08-20): desactivar una categoría debe OCULTAR sus productos de los
 * listados de venta (catálogo de caja `only_active` y menú público /web/menu),
 * sin tocar el listado completo del admin ni los productos sin categoría.
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Categorías inactivas ocultan sus productos (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;

  let catMuertaId: string;

  const DIRECT_RESALE_FIELDS = {
    basePrice: 5000,
    directResale: true,
    unitPurchase: 'unidad',
    unitStock: 'unidad',
    conversionFactor: 1,
    thresholdMin: 0,
  };

  const namesOf = (body: Array<{ name: string }>): string[] => body.map((p) => p.name);

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-cat@test.local',
        fullName: 'Dueño Cat',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-cat@test.local');

    for (const name of ['Cat Viva', 'Cat Muerta']) {
      const res = await request
        .post('/product-categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name })
        .expect(201);
      if (name === 'Cat Muerta') catMuertaId = res.body.id as string;
    }

    await request
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Prod Vivo', category: 'Cat Viva', ...DIRECT_RESALE_FIELDS })
      .expect(201);
    await request
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Prod Oculto', category: 'Cat Muerta', ...DIRECT_RESALE_FIELDS })
      .expect(201);
    // Crear exige categoría; el caso "sin categoría" se llega vía PATCH.
    const sinCatRes = await request
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Prod Sin Categoria', category: 'Test', ...DIRECT_RESALE_FIELDS })
      .expect(201);
    await request
      .patch(`/products/${sinCatRes.body.id as string}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ category: null })
      .expect(200);

    await request
      .patch(`/product-categories/${catMuertaId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false })
      .expect(200);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('only_active (catálogo de caja) excluye los productos de la categoría inactiva', async () => {
    const res = await request
      .get('/products?only_active=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const names = namesOf(res.body as Array<{ name: string }>);
    expect(names).toContain('Prod Vivo');
    expect(names).toContain('Prod Sin Categoria');
    expect(names).not.toContain('Prod Oculto');
  });

  it('el listado completo del admin (sin only_active) los sigue mostrando', async () => {
    const res = await request
      .get('/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(namesOf(res.body as Array<{ name: string }>)).toContain('Prod Oculto');
  });

  it('/web/menu excluye el producto Y el chip de la categoría inactiva', async () => {
    const res = await request.get('/web/menu').expect(200);
    const names = namesOf(res.body.products as Array<{ name: string }>);
    expect(names).toContain('Prod Vivo');
    expect(names).toContain('Prod Sin Categoria');
    expect(names).not.toContain('Prod Oculto');
    expect(res.body.categories as string[]).toContain('Cat Viva');
    expect(res.body.categories as string[]).not.toContain('Cat Muerta');
  });

  it('reactivar la categoría vuelve a mostrar sus productos en only_active', async () => {
    await request
      .patch(`/product-categories/${catMuertaId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: true })
      .expect(200);
    const res = await request
      .get('/products?only_active=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(namesOf(res.body as Array<{ name: string }>)).toContain('Prod Oculto');
  });
});
