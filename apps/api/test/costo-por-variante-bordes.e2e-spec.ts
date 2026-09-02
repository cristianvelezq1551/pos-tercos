/**
 * Los bordes del costo por variante: las ramas que la suite principal no toca.
 *
 * La suite `costo-por-variante` prueba el caso normal (un plato con variantes,
 * todas costeadas, siempre vendido eligiendo una). Al corregir los tres
 * reportes quedaron tres caminos SIN una sola prueba, y los tres son de plata:
 *
 *  1. Vender un plato con variantes SIN elegir ninguna. Pasa si el pedido entra
 *     por una vía que no obliga a elegir (un pedido web, una venta vieja). El
 *     equilibrio tiene que agregar la línea base SOLO en ese caso — inventarla
 *     siempre metería en el promedio un plato que no existe en la carta.
 *  2. Una variante cuyo costo NO se sabe (un insumo sin precio de compra). No
 *     puede colarse como $0: queda fuera y se reporta (§7.v32).
 *  3. Un combo que contiene un producto con variantes. El componente no lleva
 *     variante elegida, así que se costea con la base — y eso hay que dejarlo
 *     escrito para que nadie lo "corrija" en silencio.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { mesLocalQuery } from './helpers/local-day';

/** Papa $10/g · Pollo $30/g · Misterio SIN precio de compra. */
const COSTO_BASE = 1000; // 100 g de papa
const COSTO_CON_POLLO = 4000; // + 100 g de pollo
const PRECIO_BASE = 20_000;
const RECARGO_POLLO = 6000;

describe('Costo por variante: los bordes E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;

  let platoId: string;
  let conPolloId: string;
  let sinCostoId: string;
  let comboId: string;
  let shiftId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const monthly = async () => {
    app.get(CogsService).invalidateLedgerCache();
    return (
      await request.get(`/reports/financial/monthly?${mesLocalQuery()}`).set(auth()).expect(200)
    ).body as {
      catalogBreakEven: {
        marginPct: number | null;
        productsConsidered: number;
        productsWithoutCost: number;
        best: { name: string } | null;
        worst: { name: string } | null;
      };
    };
  };

  const vender = async (items: object[]): Promise<{ id: string; total: number }> => {
    const venta = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items })
      .expect(201);
    await request
      .post(`/sales/${venta.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: venta.body.total })
      .expect(201);
    return { id: venta.body.id as string, total: venta.body.total as number };
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-bordes@test.local',
        fullName: 'Dueño Bordes',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-bordes@test.local');

    const insumo = async (name: string, costoPorKilo: number | null) => {
      const res = await request
        .post('/ingredients')
        .set(auth())
        .send({ name, unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000 })
        .expect(201);
      const id = res.body.id as string;
      if (costoPorKilo !== null) {
        await prisma.ingredient.update({ where: { id }, data: { lastUnitCost: costoPorKilo } });
      }
      return id;
    };
    const papa = await insumo('Papa Borde', 10_000);
    const pollo = await insumo('Pollo Borde', 30_000);
    // Nunca se compró: no hay precio con qué costearlo.
    const misterio = await insumo('Insumo Misterio', null);

    const creado = await request
      .post('/products')
      .set(auth())
      .send({
        category: 'Comidas',
        name: 'Plato de bordes',
        basePrice: PRECIO_BASE,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
        sizes: [
          { name: 'Con pollo', priceModifier: RECARGO_POLLO, sortOrder: 0 },
          { name: 'Con misterio', priceModifier: 4000, sortOrder: 1 },
        ],
      })
      .expect(201);
    platoId = creado.body.id as string;
    const tamanos = creado.body.sizes as Array<{ id: string; name: string }>;
    conPolloId = tamanos.find((t) => t.name === 'Con pollo')!.id;
    sinCostoId = tamanos.find((t) => t.name === 'Con misterio')!.id;

    await request
      .put(`/products/${platoId}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: papa, quantityNeta: 100, mermaPct: 0 }] })
      .expect(200);
    await request
      .put(`/products/${platoId}/sizes/${conPolloId}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: pollo, quantityNeta: 100, mermaPct: 0 }] })
      .expect(200);
    await request
      .put(`/products/${platoId}/sizes/${sinCostoId}/recipe`)
      .set(auth())
      .send({
        edges: [{ childType: 'ingredient', childId: misterio, quantityNeta: 50, mermaPct: 0 }],
      })
      .expect(200);

    const combo = await request
      .post('/products')
      .set(auth())
      .send({
        category: 'Combos',
        name: 'Combo de bordes',
        basePrice: 0,
        directResale: false,
        isCombo: true,
        comboPrice: 24_000,
        modifiersEnabled: false,
        comboComponents: [{ productId: platoId, quantity: 1 }],
      })
      .expect(201);
    comboId = combo.body.id as string;

    for (const [id, delta, unitCost] of [
      [papa, 10_000, 10],
      [pollo, 10_000, 30],
    ] as const) {
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ entityType: 'INGREDIENT', ingredientId: id, delta, type: 'INITIAL', unitCost })
        .expect(201);
    }
    // El misterio también tiene existencias: lo que falta es su PRECIO, no el stock.
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'INGREDIENT', ingredientId: misterio, delta: 1000, type: 'INITIAL' })
      .expect(201);

    const caja = await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
    shiftId = caja.body.id as string;

    // Una venta CON variante y otra SIN elegir ninguna.
    await vender([{ productId: platoId, sizeId: conPolloId, quantity: 1 }]);
    await vender([{ productId: platoId, quantity: 1 }]);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('vender sin elegir variante', () => {
    it('el pedido se costea con la receta base, que es lo único que se sabe', async () => {
      const detalle = (
        await request.get(`/shifts/${shiftId}/detail`).set(auth()).expect(200)
      ).body as {
        orders: Array<{ total: number; costTotal: number | null }>;
      };
      const sinVariante = detalle.orders.find((o) => o.total === PRECIO_BASE);
      const conVariante = detalle.orders.find((o) => o.total === PRECIO_BASE + RECARGO_POLLO);
      expect(sinVariante!.costTotal).toBeCloseTo(COSTO_BASE, 0);
      expect(conVariante!.costTotal).toBeCloseTo(COSTO_CON_POLLO, 0);
    });

    it('el top de productos suma las dos: la variante Y la base', async () => {
      const res = await request.get('/reports/top-products?limit=50').set(auth()).expect(200);
      const fila = (
        res.body as { products: Array<{ productId: string; quantity: number; estCost: number | null }> }
      ).products.find((p) => p.productId === platoId);
      expect(fila!.quantity).toBe(2);
      expect(fila!.estCost).toBeCloseTo(COSTO_BASE + COSTO_CON_POLLO, 0);
    });

    it('el equilibrio agrega la línea base SOLO porque hubo una venta así', async () => {
      const c = (await monthly()).catalogBreakEven;
      // «Con pollo» + el combo + la línea base del plato = 3 con costo conocido.
      // «Con misterio» queda fuera (no se sabe su costo) y se reporta aparte.
      expect(c.productsConsidered).toBe(3);
      expect(c.productsWithoutCost).toBe(1);

      // Que la línea base ENTRÓ se prueba con la aritmética, no con el nombre
      // (queda en el medio, así que no es ni la mejor ni la peor): el promedio
      // se pesa por lo vendido, y se vendió una de cada una.
      //   con pollo → ($26.000 − $4.000) = $22.000 de margen sobre $26.000
      //   base      → ($20.000 − $1.000) = $19.000 de margen sobre $20.000
      const ingresoPollo = PRECIO_BASE + RECARGO_POLLO;
      const esperado =
        (ingresoPollo - COSTO_CON_POLLO + (PRECIO_BASE - COSTO_BASE)) /
        (ingresoPollo + PRECIO_BASE);
      expect(c.marginPct).toBeCloseTo(esperado, 4);
      // Y queda entre las dos: sin la línea base sería el margen de la variante sola.
      expect(c.marginPct!).toBeGreaterThan((ingresoPollo - COSTO_CON_POLLO) / ingresoPollo);
      expect(c.marginPct!).toBeLessThan((PRECIO_BASE - COSTO_BASE) / PRECIO_BASE);
    });
  });

  describe('una variante que no se puede costear', () => {
    it('queda en null y dice por qué — nunca en $0', async () => {
      const res = await request.get('/product-costs/with-variants').set(auth()).expect(200);
      const fila = (
        res.body as Array<{
          productId: string;
          variants: Array<{ sizeId: string; totalCost: number | null; missingReasons: string[] }>;
        }>
      ).find((p) => p.productId === platoId)!;
      const misteriosa = fila.variants.find((v) => v.sizeId === sinCostoId)!;
      expect(misteriosa.totalCost).toBeNull();
      expect(misteriosa.missingReasons.length).toBeGreaterThan(0);
      // Y no arrastra a la de al lado.
      expect(fila.variants.find((v) => v.sizeId === conPolloId)!.totalCost).toBeCloseTo(
        COSTO_CON_POLLO,
        2,
      );
    });

    it('el equilibrio la deja FUERA del promedio y la cuenta aparte', async () => {
      const c = (await monthly()).catalogBreakEven;
      expect(c.productsWithoutCost).toBe(1);
      // Si hubiera entrado con costo 0, su margen sería 100 % y el promedio
      // se iría para arriba: con las tres conocidas nunca llega a eso.
      expect(c.marginPct!).toBeLessThan(1);
    });

    it('vendida, deja el costo del producto en desconocido (no en una media verdad)', async () => {
      await vender([{ productId: platoId, sizeId: sinCostoId, quantity: 1 }]);
      const res = await request.get('/reports/top-products?limit=50').set(auth()).expect(200);
      const fila = (
        res.body as { products: Array<{ productId: string; estCost: number | null; estMargin: number | null }> }
      ).products.find((p) => p.productId === platoId)!;
      expect(fila.estCost).toBeNull();
      expect(fila.estMargin).toBeNull();
    });
  });

  describe('un combo con un producto de variantes adentro', () => {
    it('costea el componente con la receta base (nadie eligió variante ahí)', async () => {
      const res = await request.get('/product-costs/with-variants').set(auth()).expect(200);
      const combo = (
        res.body as Array<{ productId: string; totalCost: number | null; variants: unknown[] }>
      ).find((p) => p.productId === comboId)!;
      expect(combo.totalCost).toBeCloseTo(COSTO_BASE, 2);
      expect(combo.variants).toEqual([]);
    });
  });
});
