/**
 * Reglas del combo con componentes con variante (PLAN-COMBO-CON-VARIANTE.md):
 *
 *  L6 — lo que la caja ofrece se puede cobrar. Si se acaba la proteína de la
 *       variante, el combo se apaga Y el cobro lo rechaza (nunca uno sin el
 *       otro: la caja trabada con el cliente enfrente es peor que no ofrecerlo).
 *       Un consumible (el empaque) no frena la venta.
 *  L8 — lo mal configurado no se guarda: un producto con variantes sin elegir
 *       una, una variante de otro producto, una variante en un producto que no
 *       tiene, o borrar una variante que usa un combo. Siempre con un mensaje
 *       que dice qué pasó y qué hacer — nunca un 500 (que además abre alerta).
 *
 * Suite aparte de `combo-variante.e2e-spec.ts` a propósito: acá se juega con el
 * stock hasta dejarlo corto, y eso no puede mover los costos de la otra.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('Combo con variante — disponibilidad y reglas E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;

  let polloId: string;
  let papasId: string;
  let tamPolloId: string;
  let tamCarneId: string;
  let burroId: string;
  let tamBurroId: string;
  let gaseosaId: string;
  let comboId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const disponibilidad = async (productId: string) => {
    const res = await request.get('/products/availability/internal').set(auth()).expect(200);
    const fila = (
      res.body as Array<{
        productId: string;
        available: boolean;
        reason: string | null;
        variants: Array<{ sizeId: string; available: boolean }>;
        choiceOptions: Array<{ productId: string; available: boolean; reason: string | null }>;
      }>
    ).find((p) => p.productId === productId);
    expect(fila).toBeDefined();
    return fila!;
  };

  const crearVenta = (items: object[]) =>
    request.post('/sales').set(auth()).set('Idempotency-Key', randomUUID()).send({ type: 'COUNTER', items });

  const cobrar = (saleId: string, total: number) =>
    request.post(`/sales/${saleId}/confirm-payment`).set(auth()).send({ method: 'CASH', amountReceived: total });

  const crearCombo = (name: string, comboComponents: object[]) =>
    request
      .post('/products')
      .set(auth())
      .send({ category: 'Test', name, basePrice: 30_000, isCombo: true, comboPrice: 30_000, modifiersEnabled: false, comboComponents });

  const mensaje = (body: { message?: unknown }) => String(body.message ?? '');

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    await prisma.user.create({
      data: {
        email: 'dueno-combovar-reglas@test.local',
        fullName: 'Dueño Reglas',
        role: 'DUENO',
        passwordHash: await bcrypt.hash('dev12345', 10),
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-combovar-reglas@test.local');

    const insumo = async (name: string, stock: number, extra: object = {}): Promise<string> => {
      const id = (
        await request
          .post('/ingredients')
          .set(auth())
          .send({ name, unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, ...extra })
          .expect(201)
      ).body.id as string;
      await prisma.ingredient.update({ where: { id }, data: { lastUnitCost: 10_000 } });
      if (stock > 0) {
        await request
          .post('/inventory/movements')
          .set(auth())
          .send({ type: 'INITIAL', entityType: 'INGREDIENT', ingredientId: id, delta: stock, unitCost: 10 })
          .expect(201);
      }
      return id;
    };
    const papaId = await insumo('Papa Reglas', 10_000);
    // Consumible SIN stock a propósito: no puede frenar la venta.
    const empaqueId = await insumo('Empaque Reglas', 0, { blocksAvailability: false });
    // Alcanza para UNA porción de pollo (100 g) pero no para el combo (200 g).
    polloId = await insumo('Pollo Reglas', 150);
    const carneId = await insumo('Carne Reglas', 10_000);

    const papas = await request
      .post('/products')
      .set(auth())
      .send({
        category: 'Test',
        name: 'Papas Reglas',
        basePrice: 25_000,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
        sizes: [
          { name: 'Pollo', priceModifier: 0, sortOrder: 0 },
          { name: 'Carne', priceModifier: 3000, sortOrder: 1 },
        ],
      })
      .expect(201);
    papasId = papas.body.id as string;
    const tamanos = papas.body.sizes as Array<{ id: string; name: string }>;
    tamPolloId = tamanos.find((t) => t.name === 'Pollo')!.id;
    tamCarneId = tamanos.find((t) => t.name === 'Carne')!.id;
    await request
      .put(`/products/${papasId}/recipe`)
      .set(auth())
      .send({
        edges: [
          { childType: 'ingredient', childId: papaId, quantityNeta: 200 },
          { childType: 'ingredient', childId: empaqueId, quantityNeta: 1 },
        ],
      })
      .expect(200);
    await request
      .put(`/products/${papasId}/sizes/${tamPolloId}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: polloId, quantityNeta: 100 }] })
      .expect(200);
    await request
      .put(`/products/${papasId}/sizes/${tamCarneId}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: carneId, quantityNeta: 100 }] })
      .expect(200);

    const burro = await request
      .post('/products')
      .set(auth())
      .send({
        category: 'Test',
        name: 'Burro Reglas',
        basePrice: 27_000,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
        sizes: [{ name: 'Único', priceModifier: 0, sortOrder: 0 }],
      })
      .expect(201);
    burroId = burro.body.id as string;
    tamBurroId = (burro.body.sizes as Array<{ id: string }>)[0].id;

    gaseosaId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Test',
          name: 'Gaseosa Reglas',
          basePrice: 5000,
          directResale: true,
          unitPurchase: 'caja',
          unitStock: 'unidad',
          conversionFactor: 24,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ type: 'INITIAL', entityType: 'PRODUCT', productId: gaseosaId, delta: 50, unitCost: 1000 })
      .expect(201);

    comboId = (await crearCombo('2 Papas Pollo Reglas', [{ productId: papasId, sizeId: tamPolloId, quantity: 2 }]).expect(201))
      .body.id as string;

    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('L6 — lo que la caja ofrece se puede cobrar', () => {
    it('sin pollo para dos porciones, el combo se apaga y dice qué falta', async () => {
      const combo = await disponibilidad(comboId);
      expect(combo.available).toBe(false);
      expect(combo.reason).toContain('Pollo Reglas');
      // El empaque está en cero, pero es consumible: no aparece como motivo.
      expect(combo.reason).not.toContain('Empaque Reglas');
    });

    it('el plato suelto sí se ofrece: para UNA porción el pollo alcanza', async () => {
      const papas = await disponibilidad(papasId);
      expect(papas.available).toBe(true);
      expect(papas.variants.find((v) => v.sizeId === tamPolloId)?.available).toBe(true);
    });

    it('y el cobro lo rechaza igual, sin descontar nada', async () => {
      const venta = await crearVenta([{ productId: comboId, quantity: 1 }]).expect(201);
      await cobrar(venta.body.id, venta.body.total).expect(409);
      expect(await prisma.inventoryMovement.count({ where: { sourceType: 'sale', sourceId: venta.body.id } })).toBe(0);
      await request.post(`/sales/${venta.body.id}/cancel`).set(auth()).expect((res) => {
        if (res.status >= 300) throw new Error(`cancel: ${res.status} ${JSON.stringify(res.body)}`);
      });
    });

    it('al reponer el pollo, el combo vuelve y se cobra', async () => {
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ type: 'MANUAL_ADJUSTMENT', entityType: 'INGREDIENT', ingredientId: polloId, delta: 100, unitCost: 10, notes: 'Reposición de prueba' })
        .expect(201);
      expect((await disponibilidad(comboId)).available).toBe(true);
      const venta = await crearVenta([{ productId: comboId, quantity: 1 }]).expect(201);
      await cobrar(venta.body.id, venta.body.total).expect(201);
    });
  });

  describe('L8 — lo mal configurado no se guarda', () => {
    it('un producto con variantes en el combo exige elegir cuál', async () => {
      const res = await crearCombo('Combo sin variante Reglas', [{ productId: papasId, quantity: 2 }]).expect(400);
      expect(mensaje(res.body)).toContain('Papas Reglas');
      expect(mensaje(res.body).toLowerCase()).toContain('variante');
      expect(mensaje(res.body)).not.toMatch(UUID);
    });

    it('la variante tiene que ser de ESE producto', async () => {
      const res = await crearCombo('Combo variante ajena Reglas', [
        { productId: papasId, sizeId: tamBurroId, quantity: 1 },
      ]).expect(400);
      expect(mensaje(res.body)).toContain('Papas Reglas');
      expect(mensaje(res.body)).not.toMatch(UUID);
    });

    it('un producto sin variantes no puede llevar una', async () => {
      const res = await crearCombo('Combo gaseosa con variante Reglas', [
        { productId: gaseosaId, sizeId: tamPolloId, quantity: 1 },
      ]).expect(400);
      expect(mensaje(res.body)).toContain('Gaseosa Reglas');
      expect(mensaje(res.body)).not.toMatch(UUID);
    });

    it('editar los componentes aplica las mismas reglas y no toca el combo si falla', async () => {
      await request
        .put(`/products/${comboId}/combo`)
        .set(auth())
        .send({ components: [{ productId: burroId, quantity: 1 }] })
        .expect(400);
      const despues = await request.get(`/products/${comboId}`).set(auth()).expect(200);
      expect(despues.body.comboComponents).toEqual([
        expect.objectContaining({ productId: papasId, sizeId: tamPolloId, quantity: 2 }),
      ]);
    });

    it('editar los componentes con su variante sí se guarda', async () => {
      const res = await request
        .put(`/products/${comboId}/combo`)
        .set(auth())
        .send({
          components: [
            { productId: papasId, sizeId: tamPolloId, quantity: 2 },
            { productId: burroId, sizeId: tamBurroId, quantity: 1 },
          ],
        })
        .expect(200);
      expect(res.body.comboComponents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ productId: papasId, sizeId: tamPolloId, quantity: 2 }),
          expect.objectContaining({ productId: burroId, sizeId: tamBurroId, quantity: 1 }),
        ]),
      );
    });

    it('una opción a elegir no puede ser un plato con variantes (elegir la variante ahí no existe todavía)', async () => {
      const res = await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Test',
          name: 'Combo con opción con variantes Reglas',
          basePrice: 30_000,
          isCombo: true,
          comboPrice: 30_000,
          modifiersEnabled: false,
          comboComponents: [{ productId: gaseosaId, quantity: 1 }],
          choiceGroups: [{ label: 'Acompañamiento', quantity: 1, options: [{ productId: papasId }, { productId: gaseosaId }] }],
        })
        .expect(400);
      expect(mensaje(res.body)).toContain('Papas Reglas');
      expect(mensaje(res.body)).not.toMatch(UUID);
    });

    it('REGRESIÓN: un combo de productos sin variantes se guarda como siempre', async () => {
      await crearCombo('Combo solo gaseosas Reglas', [{ productId: gaseosaId, quantity: 2 }]).expect(201);
    });

    it('renombrar una variante que usa un combo se permite (el combo la sigue)', async () => {
      await request
        .put(`/products/${papasId}/options`)
        .set(auth())
        .send({
          sizes: [
            { id: tamPolloId, name: 'Pollo y Miel', priceModifier: 0, sortOrder: 0 },
            { id: tamCarneId, name: 'Carne', priceModifier: 3000, sortOrder: 1 },
          ],
          modifiers: [],
        })
        .expect(200);
    });

    it('borrar una variante que usa un combo se rechaza y dice cuál combo', async () => {
      const res = await request
        .put(`/products/${papasId}/options`)
        .set(auth())
        .send({ sizes: [{ id: tamCarneId, name: 'Carne', priceModifier: 3000, sortOrder: 1 }], modifiers: [] })
        .expect(400);
      expect(mensaje(res.body)).toContain('2 Papas Pollo Reglas');
      expect(mensaje(res.body)).not.toMatch(UUID);
      // Y la variante sigue ahí, con su receta.
      expect(await prisma.productSize.count({ where: { id: tamPolloId } })).toBe(1);
      expect(await prisma.recipeEdge.count({ where: { parentSizeId: tamPolloId } })).toBe(1);
    });
  });

  /**
   * Decisión del dueño (2026-10-20): si a un producto que YA está en un combo
   * le agregan variantes, el combo se apaga hasta que lo editen. Venderlo con la
   * receta base sería el error silencioso que esto viene a cerrar.
   */
  describe('L9 — un componente que se quedó sin variante no vende', () => {
    let sandwichId: string;
    let comboSandwichId: string;
    let ventaPendienteId: string;
    let ventaPendienteTotal: number;

    beforeAll(async () => {
      const panId = (
        await request
          .post('/ingredients')
          .set(auth())
          .send({ name: 'Pan Reglas', unitPurchase: 'paquete', unitRecipe: 'unidad', conversionFactor: 10 })
          .expect(201)
      ).body.id as string;
      await prisma.ingredient.update({ where: { id: panId }, data: { lastUnitCost: 5000 } });
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ type: 'INITIAL', entityType: 'INGREDIENT', ingredientId: panId, delta: 100, unitCost: 500 })
        .expect(201);
      sandwichId = (
        await request
          .post('/products')
          .set(auth())
          .send({ category: 'Test', name: 'Sandwich Reglas', basePrice: 18_000, directResale: false, isCombo: false, modifiersEnabled: false })
          .expect(201)
      ).body.id as string;
      await request
        .put(`/products/${sandwichId}/recipe`)
        .set(auth())
        .send({ edges: [{ childType: 'ingredient', childId: panId, quantityNeta: 1 }] })
        .expect(200);
      comboSandwichId = (await crearCombo('Combo Sandwich Reglas', [{ productId: sandwichId, quantity: 1 }]).expect(201))
        .body.id as string;
    });

    it('mientras el plato no tiene variantes, el combo se vende normal', async () => {
      expect((await disponibilidad(comboSandwichId)).available).toBe(true);
      // Un pedido que queda abierto ANTES del cambio (una cuenta abierta).
      const venta = await crearVenta([{ productId: comboSandwichId, quantity: 1 }]).expect(201);
      ventaPendienteId = venta.body.id as string;
      ventaPendienteTotal = venta.body.total as number;
    });

    it('al agregarle variantes al plato, el combo se apaga y dice qué falta', async () => {
      await request
        .put(`/products/${sandwichId}/options`)
        .set(auth())
        .send({ sizes: [{ name: 'Clásico', priceModifier: 0, sortOrder: 0 }], modifiers: [] })
        .expect(200);
      const combo = await disponibilidad(comboSandwichId);
      expect(combo.available).toBe(false);
      expect(combo.reason).toBe('Falta elegir la variante de Sandwich Reglas en el combo');
    });

    it('no se puede agregar a un pedido nuevo', async () => {
      const res = await crearVenta([{ productId: comboSandwichId, quantity: 1 }]).expect(400);
      expect(mensaje(res.body)).toContain('Sandwich Reglas');
      expect(mensaje(res.body).toLowerCase()).toContain('variante');
      expect(mensaje(res.body)).not.toMatch(UUID);
    });

    it('el pedido que ya lo tenía no se cobra con la receta base, y no descuenta nada', async () => {
      const res = await cobrar(ventaPendienteId, ventaPendienteTotal).expect(400);
      expect(mensaje(res.body)).toContain('Sandwich Reglas');
      expect(mensaje(res.body)).not.toMatch(UUID);
      expect(
        await prisma.inventoryMovement.count({ where: { sourceType: 'sale', sourceId: ventaPendienteId } }),
      ).toBe(0);
    });

    it('al elegir la variante en el combo, vuelve a venderse y el pedido se cobra', async () => {
      const sandwich = await request.get(`/products/${sandwichId}`).set(auth()).expect(200);
      const clasicoId = (sandwich.body.sizes as Array<{ id: string }>)[0].id;
      await request
        .put(`/products/${comboSandwichId}/combo`)
        .set(auth())
        .send({ components: [{ productId: sandwichId, sizeId: clasicoId, quantity: 1 }] })
        .expect(200);
      expect((await disponibilidad(comboSandwichId)).available).toBe(true);
      await cobrar(ventaPendienteId, ventaPendienteTotal).expect(201);
    });

    it('una OPCIÓN a elegir que gana variantes se apaga y no se puede elegir; las demás siguen', async () => {
      const postreId = (
        await request
          .post('/products')
          .set(auth())
          .send({ category: 'Test', name: 'Postre Reglas', basePrice: 6000, directResale: false, isCombo: false, modifiersEnabled: false })
          .expect(201)
      ).body.id as string;
      const combo = await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Test',
          name: 'Combo con postre Reglas',
          basePrice: 30_000,
          isCombo: true,
          comboPrice: 30_000,
          modifiersEnabled: false,
          comboComponents: [{ productId: gaseosaId, quantity: 1 }],
          choiceGroups: [{ label: 'Final', quantity: 1, options: [{ productId: postreId }, { productId: gaseosaId }] }],
        })
        .expect(201);
      const comboConPostreId = combo.body.id as string;
      const grupoId = (combo.body.choiceGroups as Array<{ id: string }>)[0].id;

      await request
        .put(`/products/${postreId}/options`)
        .set(auth())
        .send({ sizes: [{ name: 'Grande', priceModifier: 2000, sortOrder: 0 }], modifiers: [] })
        .expect(200);

      const disp = await disponibilidad(comboConPostreId);
      // El combo sigue: la gaseosa todavía se puede elegir.
      expect(disp.available).toBe(true);
      const opcionPostre = disp.choiceOptions.find((o) => o.productId === postreId);
      expect(opcionPostre?.available).toBe(false);
      expect(opcionPostre?.reason).toBe('Tiene variantes: quítalo de las opciones');

      const conPostre = await crearVenta([
        { productId: comboConPostreId, quantity: 1, choices: [{ groupId: grupoId, productId: postreId, quantity: 1 }] },
      ]).expect(400);
      expect(mensaje(conPostre.body)).toContain('Postre Reglas');
      expect(mensaje(conPostre.body)).not.toMatch(UUID);
      await crearVenta([
        { productId: comboConPostreId, quantity: 1, choices: [{ groupId: grupoId, productId: gaseosaId, quantity: 1 }] },
      ]).expect(201);
    });
  });
});
