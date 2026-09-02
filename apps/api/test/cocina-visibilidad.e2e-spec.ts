/**
 * cocina-visibilidad.e2e-spec.ts
 *
 * "Se ve en cocina" (`showInKitchen`) y la foto de preparación.
 *
 * El catálogo tiene cosas que existen SOLO para costear —empaques,
 * recipientes, bolsas—: se descuentan y se costean, pero el cocinero no las
 * prepara ni las cuenta, y en la Biblia y en su inventario eran ruido. La
 * regla que se fija acá: ocultarlas de la cocina NO puede cambiar nada de
 * inventario ni de costeo.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Visibilidad en cocina y foto de preparación (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cocineroToken: string;
  let panId: string;
  let recipienteId: string;
  let polloId: string;
  let conVariantesId: string;
  let sencillaId: string;
  let conPolloId: string;
  let salsaId: string;
  let productId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const password = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-vis@test.local', passwordHash: password, fullName: 'Dueño', role: 'DUENO' },
        {
          email: 'cocinero-vis@test.local',
          passwordHash: password,
          fullName: 'Cocinero',
          role: 'COCINERO',
        },
      ],
    });
    duenoToken = await loginAs(request, 'dueno-vis@test.local', 'dev12345');
    cocineroToken = await loginAs(request, 'cocinero-vis@test.local', 'dev12345');

    const ing = async (name: string, showInKitchen: boolean): Promise<string> => {
      const res = await request
        .post('/ingredients')
        .set(auth(duenoToken))
        .send({
          name,
          unitPurchase: 'paquete',
          unitRecipe: 'unidad',
          conversionFactor: 10,
          showInKitchen,
        })
        .expect(201);
      return res.body.id as string;
    };
    panId = await ing(`Pan ${randomUUID().slice(0, 6)}`, true);
    recipienteId = await ing(`Recipiente ${randomUUID().slice(0, 6)}`, false);

    const salsa = await request
      .post('/subproducts')
      .set(auth(duenoToken))
      .send({ name: `Salsa ${randomUUID().slice(0, 6)}`, yield: 10, unit: 'porción' })
      .expect(201);
    salsaId = salsa.body.id as string;

    await prisma.productCategory.upsert({
      where: { name: 'Burgers' },
      update: {},
      create: { name: 'Burgers' },
    });
    const prod = await request
      .post('/products')
      .set(auth(duenoToken))
      .send({
        name: `Hamburguesa ${randomUUID().slice(0, 6)}`,
        basePrice: 20000,
        category: 'Burgers',
        imageUrl: '/api/products/images/carta.png',
        prepImages: [
          { url: '/api/products/images/sencilla.png', label: 'Sencilla' },
          { url: '/api/products/images/doble.png', label: 'Doble' },
        ],
      })
      .expect(201);
    productId = prod.body.id as string;

    // Receta: pan + salsa + el recipiente que solo existe para costear.
    await request
      .put(`/products/${productId}/recipe`)
      .set(auth(duenoToken))
      .send({
        edges: [
          { childType: 'ingredient', childId: panId, quantityNeta: 1 },
          { childType: 'subproduct', childId: salsaId, quantityNeta: 1 },
          { childType: 'ingredient', childId: recipienteId, quantityNeta: 1 },
        ],
      })
      .expect(200);

    // Un plato CON variantes: cada una suma su proteína. Antes la biblia le
    // mostraba al cocinero solo la base y ninguna de las proteínas.
    polloId = await ing(`Pollo ${randomUUID().slice(0, 6)}`, true);
    const conVariantes = await request
      .post('/products')
      .set(auth(duenoToken))
      .send({
        name: `Papas con proteína ${randomUUID().slice(0, 6)}`,
        basePrice: 25000,
        category: 'Burgers',
        sizes: [
          { name: 'Sencilla', priceModifier: 0, sortOrder: 0 },
          { name: 'Con pollo', priceModifier: 5000, sortOrder: 1 },
        ],
      })
      .expect(201);
    conVariantesId = conVariantes.body.id as string;
    const tamanos = conVariantes.body.sizes as Array<{ id: string; name: string }>;
    sencillaId = tamanos.find((t) => t.name === 'Sencilla')!.id;
    conPolloId = tamanos.find((t) => t.name === 'Con pollo')!.id;
    await request
      .put(`/products/${conVariantesId}/recipe`)
      .set(auth(duenoToken))
      .send({ edges: [{ childType: 'ingredient', childId: panId, quantityNeta: 2 }] })
      .expect(200);
    // La variante lleva el pollo Y un recipiente que solo existe para costear.
    await request
      .put(`/products/${conVariantesId}/sizes/${conPolloId}/recipe`)
      .set(auth(duenoToken))
      .send({
        edges: [
          { childType: 'ingredient', childId: polloId, quantityNeta: 1 },
          { childType: 'ingredient', childId: recipienteId, quantityNeta: 1 },
        ],
      })
      .expect(200);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('nace visible en cocina: lo que ya estaba cargado no cambia', async () => {
    const res = await request.get(`/ingredients/${panId}`).set(auth(duenoToken)).expect(200);
    expect(res.body.showInKitchen).toBe(true);
  });

  it('el inventario de cocina deja fuera lo que es solo para costear', async () => {
    const res = await request.get('/kitchen/stock').set(auth(cocineroToken)).expect(200);
    const ids = (res.body as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain(panId);
    expect(ids).not.toContain(recipienteId);
  });

  describe('la Biblia muestra lo que suma cada variante', () => {
    const fichaConVariantes = async () => {
      const res = await request.get('/recipe-book').set(auth(cocineroToken)).expect(200);
      const entry = (
        res.body.products as Array<{
          id: string;
          components: Array<{ id: string }>;
          variants?: Array<{ sizeId: string; name: string; components: Array<{ id: string }> }>;
        }>
      ).find((p) => p.id === conVariantesId);
      expect(entry).toBeDefined();
      return entry!;
    };

    it('la variante trae su proteína, que la receta base no tiene', async () => {
      const entry = await fichaConVariantes();
      expect(entry.components.map((c) => c.id)).toEqual([panId]);
      const conPollo = entry.variants?.find((v) => v.sizeId === conPolloId);
      expect(conPollo?.name).toBe('Con pollo');
      expect(conPollo?.components.map((c) => c.id)).toContain(polloId);
    });

    it('dentro de la variante tampoco se le muestra lo que es solo para costear', async () => {
      const conPollo = (await fichaConVariantes()).variants?.find((v) => v.sizeId === conPolloId);
      expect(conPollo?.components.map((c) => c.id)).not.toContain(recipienteId);
    });

    it('una variante sin receta propia no aparece: no hay nada que sumar', async () => {
      const entry = await fichaConVariantes();
      expect(entry.variants?.some((v) => v.sizeId === sencillaId)).toBe(false);
    });

    it('un producto sin variantes no inventa ninguna', async () => {
      const res = await request.get('/recipe-book').set(auth(cocineroToken)).expect(200);
      const entry = (
        res.body.products as Array<{ id: string; variants?: unknown[] }>
      ).find((p) => p.id === productId);
      expect(entry?.variants ?? []).toEqual([]);
    });
  });

  it('la Biblia no lista el recipiente dentro de "Lleva"', async () => {
    const res = await request.get('/recipe-book').set(auth(cocineroToken)).expect(200);
    const entry = (res.body.products as Array<{ id: string; components: Array<{ id: string }> }>).find(
      (p) => p.id === productId,
    );
    expect(entry).toBeDefined();
    const componentes = entry!.components.map((c) => c.id);
    expect(componentes).toContain(panId);
    expect(componentes).toContain(salsaId);
    expect(componentes).not.toContain(recipienteId);
  });

  // Un plato se arma distinto según la variante: la biblia tiene que poder
  // mostrar una foto por cada una, y el rótulo es lo que las distingue.
  it('la Biblia manda las fotos de la preparación, no la de la carta', async () => {
    const res = await request.get('/recipe-book').set(auth(cocineroToken)).expect(200);
    const entry = (
      res.body.products as Array<{
        id: string;
        prepImages: Array<{ url: string; label: string | null }>;
        imageUrl: string | null;
      }>
    ).find((p) => p.id === productId);
    expect(entry!.prepImages).toEqual([
      { url: '/api/products/images/sencilla.png', label: 'Sencilla' },
      { url: '/api/products/images/doble.png', label: 'Doble' },
    ]);
    expect(entry!.imageUrl).toBe('/api/products/images/carta.png');
  });

  it('un subproducto también lleva sus fotos, con rótulo', async () => {
    await request
      .patch(`/subproducts/${salsaId}`)
      .set(auth(duenoToken))
      .send({ prepImages: [{ url: '/api/products/images/tanda.png', label: 'Tanda lista' }] })
      .expect(200);
    const res = await request.get('/recipe-book').set(auth(cocineroToken)).expect(200);
    const sub = (
      res.body.subproducts as Array<{ id: string; prepImages: Array<{ label: string | null }> }>
    ).find((x) => x.id === salsaId);
    expect(sub!.prepImages).toHaveLength(1);
    expect(sub!.prepImages[0]!.label).toBe('Tanda lista');
  });

  // El rótulo vacío se guarda como null: "" y null son el mismo "sin nombre" y
  // dos representaciones para lo mismo se separan con el tiempo.
  it('el rótulo en blanco se guarda como sin rótulo', async () => {
    const res = await request
      .patch(`/subproducts/${salsaId}`)
      .set(auth(duenoToken))
      .send({ prepImages: [{ url: '/api/products/images/tanda.png', label: '   ' }] })
      .expect(200);
    expect(res.body.prepImages).toEqual([{ url: '/api/products/images/tanda.png', label: null }]);
  });

  it('ocultar un subproducto lo saca de la Biblia y del inventario de cocina', async () => {
    await request
      .patch(`/subproducts/${salsaId}`)
      .set(auth(duenoToken))
      .send({ showInKitchen: false })
      .expect(200);

    const libro = await request.get('/recipe-book').set(auth(cocineroToken)).expect(200);
    expect((libro.body.subproducts as Array<{ id: string }>).map((s) => s.id)).not.toContain(salsaId);

    const stock = await request.get('/kitchen/stock').set(auth(cocineroToken)).expect(200);
    expect((stock.body as Array<{ id: string }>).map((s) => s.id)).not.toContain(salsaId);

    await request
      .patch(`/subproducts/${salsaId}`)
      .set(auth(duenoToken))
      .send({ showInKitchen: true })
      .expect(200);
  });

  // Lo que NO puede pasar: que esconderlo de la cocina lo saque del costeo.
  it('ocultarlo no cambia el costo del producto ni el inventario del admin', async () => {
    await prisma.ingredient.update({
      where: { id: recipienteId },
      data: { lastUnitCost: 1000 }, // $1.000 el paquete de 10 → $100 por unidad
    });
    await prisma.ingredient.update({ where: { id: panId }, data: { lastUnitCost: 5000 } });

    const costo = await request
      .get(`/products/${productId}/expanded-cost`)
      .set(auth(duenoToken))
      .expect(200);
    const ids = (costo.body.totals as Array<{ ingredientId: string }>).map((c) => c.ingredientId);
    expect(ids).toContain(recipienteId);

    const stockAdmin = await request.get('/inventory/stock').set(auth(duenoToken)).expect(200);
    expect((stockAdmin.body as Array<{ id: string }>).map((s) => s.id)).toContain(recipienteId);
  });
});
