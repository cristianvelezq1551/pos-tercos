/**
 * La red que faltaba: el costo estimado de un producto CON variantes.
 *
 * El dueño reportó (2026-09-02) que en `/products` un plato con variantes
 * muestra el costo y el margen de la RECETA BASE sola. Como elegir variante es
 * obligatorio para vender, ese número describe un plato que no se puede
 * comprar: Papas TERCOS decía 84,9 % de margen contra 64–67 % real.
 *
 * Antes de tocar el cálculo hay que poner el detector, porque el hueco de la
 * cobertura es exactamente el que dejaría pasar un arreglo a medias:
 * `financial-reports.e2e-spec.ts` SÍ tiene la prueba de coherencia «el
 * equilibrio coincide con el costo que muestra la ficha del producto», pero su
 * fixture es un producto de reventa SIN variantes. Ninguna suite del repo crea
 * un producto con variantes y mira su costo estimado. O sea: corregir la tabla
 * y olvidar la ficha (o al revés) pasaría en verde.
 *
 * Nació como red (Etapa 0, sin tocar producción) y hoy también fija el arreglo.
 * Deja escrito:
 *
 *  1. LA REFERENCIA: cuánto dice la ficha de cada variante (el número contra el
 *     que se van a medir las demás pantallas).
 *  2. DOS LEYES permanentes, que sobreviven al cambio de forma de la Etapa 1
 *     porque no fijan QUÉ variante elige el catálogo, solo que el número que
 *     informe lo confirme la ficha.
 *  3. QUE CADA PANTALLA COSTEA LA VARIANTE QUE SE VENDIÓ (Etapa 2): el detalle
 *     del turno, el top de productos y el punto de equilibrio. La ruta vieja
 *     `/product-costs` sigue dando la base a propósito: no se le cambió la forma.
 *  4. EL ANCLA: el cobro SÍ consume la variante (la columna vertebral está
 *     sana). Ese número no se puede mover en ninguna etapa.
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

/**
 * Números elegidos para que la mentira sea visible y redonda:
 *   Papa       $10.000/kg ÷ 1.000 g = $10 el gramo → base       100 g = $1.000
 *   Pollo      $30.000/kg ÷ 1.000 g = $30 el gramo → variante   100 g = $3.000
 *   Chicharrón $40.000/kg ÷ 1.000 g = $40 el gramo → variante    50 g = $2.000
 *
 * DOS variantes costeadas y DISTINTAS a propósito: con una sola, la suma de
 * todas las variantes coincidiría con esa única variante y la ley de coherencia
 * de abajo no distinguiría el arreglo bueno del error clásico (meter las
 * aristas de variante en el grafo común, que hace que cada producto exija la
 * UNIÓN de sus proteínas). Con dos, esa unión da $6.000 y no coincide con
 * NINGUNA ficha ($1.000 · $3.000 · $4.000).
 */
const COSTO_BASE = 1000;
const COSTO_CON_POLLO = 4000;
const COSTO_CON_CHICHARRON = 3000;
const PRECIO_BASE = 20_000;
const RECARGO_POLLO = 6000;
const PRECIO_CON_POLLO = PRECIO_BASE + RECARGO_POLLO;

describe('Costo estimado de un producto CON variantes E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let cogs: CogsService;
  let token: string;

  let productoId: string;
  let sencillaId: string;
  let conPolloId: string;
  let conChicharronId: string;
  let shiftId: string;

  /** COGS del mes antes y después de vender UNA unidad de la variante cara. */
  let cogsAntesDeVender: number;
  let cogsDespuesDeVender: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** El ledger FIFO cachea 60 s: en un test se lee fresco (igual que ledger-snapshot). */
  const monthly = async () => {
    cogs.invalidateLedgerCache();
    return (
      await request.get(`/reports/financial/monthly?${mesLocalQuery()}`).set(auth()).expect(200)
    ).body as {
      cogs: number;
      catalogBreakEven: {
        marginPct: number | null;
        productsConsidered: number;
        productsWithoutCost: number;
      };
    };
  };

  /** La ficha del producto (o de una de sus variantes): LA referencia. */
  const ficha = async (sizeId?: string): Promise<number | null> => {
    const url = sizeId
      ? `/products/${productoId}/sizes/${sizeId}/expanded-cost`
      : `/products/${productoId}/expanded-cost`;
    const res = await request.get(url).set(auth()).expect(200);
    return (res.body as { totalCost: number | null }).totalCost;
  };

  /** El costo que informa la tabla del admin (`/product-costs`) para este producto. */
  const catalogo = async (): Promise<number | null> => {
    const res = await request.get('/product-costs').set(auth()).expect(200);
    const fila = (res.body as Array<{ productId: string; totalCost: number | null }>).find(
      (p) => p.productId === productoId,
    );
    expect(fila).toBeDefined();
    return fila!.totalCost;
  };

  /** El costo del catálogo CON variantes (`/product-costs/with-variants`). */
  const catalogoConVariantes = async () => {
    const res = await request.get('/product-costs/with-variants').set(auth()).expect(200);
    const fila = (
      res.body as Array<{
        productId: string;
        totalCost: number | null;
        variants: Array<{ sizeId: string; name: string; priceModifier: number; totalCost: number | null }>;
      }>
    ).find((p) => p.productId === productoId);
    expect(fila).toBeDefined();
    return fila!;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Auto-aislada: lee agregados GLOBALES (equilibrio de la carta, P&G del
    // mes), así que un residuo de otra suite movería los números y el fallo
    // dependería del orden de los archivos.
    await cleanDb(prisma);
    cogs = app.get(CogsService);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-variante@test.local',
        fullName: 'Dueño Variante',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-variante@test.local');

    const insumo = async (name: string, costoPorKilo: number) => {
      const res = await request
        .post('/ingredients')
        .set(auth())
        .send({ name, unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000 })
        .expect(201);
      const id = res.body.id as string;
      // El costo de referencia lo escriben las facturas; acá se fija directo
      // (mismo atajo que consumption/cocina-visibilidad) — la factura no es lo
      // que se está probando.
      await prisma.ingredient.update({ where: { id }, data: { lastUnitCost: costoPorKilo } });
      return id;
    };
    const papaId = await insumo('Papa Variante', 10_000);
    const polloId = await insumo('Pollo Variante', 30_000);
    const chicharronId = await insumo('Chicharrón Variante', 40_000);

    const creado = await request
      .post('/products')
      .set(auth())
      .send({
        category: 'Test',
        name: 'Papas con proteína',
        basePrice: PRECIO_BASE,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
        sizes: [
          { name: 'Sencilla', priceModifier: 0, sortOrder: 0 },
          { name: 'Con pollo', priceModifier: RECARGO_POLLO, sortOrder: 1 },
          { name: 'Con chicharrón', priceModifier: 5000, sortOrder: 2 },
        ],
      })
      .expect(201);
    productoId = creado.body.id as string;
    const tamanos = creado.body.sizes as Array<{ id: string; name: string }>;
    sencillaId = tamanos.find((t) => t.name === 'Sencilla')!.id;
    conPolloId = tamanos.find((t) => t.name === 'Con pollo')!.id;
    conChicharronId = tamanos.find((t) => t.name === 'Con chicharrón')!.id;

    // Receta base: 100 g de papa = $1.000.
    await request
      .put(`/products/${productoId}/recipe`)
      .set(auth())
      .send({
        edges: [{ childType: 'ingredient', childId: papaId, quantityNeta: 100, mermaPct: 0 }],
      })
      .expect(200);
    // Recetas de variante (ADITIVAS): pollo suma $3.000, chicharrón $2.000.
    // «Sencilla» queda a propósito SIN receta propia.
    for (const [sizeId, insumoId, gramos] of [
      [conPolloId, polloId, 100],
      [conChicharronId, chicharronId, 50],
    ] as const) {
      await request
        .put(`/products/${productoId}/sizes/${sizeId}/recipe`)
        .set(auth())
        .send({
          edges: [{ childType: 'ingredient', childId: insumoId, quantityNeta: gramos, mermaPct: 0 }],
        })
        .expect(200);
    }

    // Stock con costo FIFO que coincide con el de referencia: así el COGS real
    // de la venta es comparable, peso a peso, con lo que muestran las pantallas.
    for (const [id, costoPorGramo] of [
      [papaId, 10],
      [polloId, 30],
      [chicharronId, 40],
    ] as const) {
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ entityType: 'INGREDIENT', ingredientId: id, delta: 5000, type: 'INITIAL', unitCost: costoPorGramo })
        .expect(201);
    }

    const caja = await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
    shiftId = caja.body.id as string;

    // Se vende UNA unidad de la variante cara. La venta va en el fixture (no en
    // un `it`) para que cada prueba sea de solo lectura y no dependa del orden.
    cogsAntesDeVender = (await monthly()).cogs;
    const venta = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: productoId, sizeId: conPolloId, quantity: 1 }] })
      .expect(201);
    expect(venta.body.total).toBe(PRECIO_CON_POLLO);
    await request
      .post(`/sales/${venta.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: PRECIO_CON_POLLO })
      .expect(201);
    cogsDespuesDeVender = (await monthly()).cogs;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('la ficha del producto: la referencia contra la que se miden las demás', () => {
    it('la receta base cuesta lo que dicen sus insumos', async () => {
      expect(await ficha()).toBeCloseTo(COSTO_BASE, 2);
    });

    it('cada variante SUMA su propia receta a la base (no la reemplaza)', async () => {
      expect(await ficha(conPolloId)).toBeCloseTo(COSTO_CON_POLLO, 2);
      expect(await ficha(conChicharronId)).toBeCloseTo(COSTO_CON_CHICHARRON, 2);
      // Y cada una suma SOLO lo suyo: la del pollo no arrastra el chicharrón.
      expect((await ficha(conPolloId))! - (await ficha())!).toBeCloseTo(3000, 2);
      expect((await ficha(conChicharronId))! - (await ficha())!).toBeCloseTo(2000, 2);
    });

    it('una variante sin receta propia cuesta lo mismo que la base (no inventa costo)', async () => {
      expect(await ficha(sencillaId)).toBeCloseTo(COSTO_BASE, 2);
    });
  });

  describe('leyes que no se pueden romper — ni hoy ni después del arreglo', () => {
    it('el costo que informa el catálogo lo confirma la ficha de ALGUNA variante', async () => {
      // Esta es la aserción que atrapa la discrepancia entre pantallas, y la
      // única que sobrevive al cambio de forma de la Etapa 1: no fija QUÉ
      // variante elige el catálogo (hoy la base; mañana la que se decida), solo
      // que el número exista en la ficha. Un cálculo paralelo que se separe
      // —olvida la merma, duplica la base, expande de más un subproducto— cae
      // FUERA del conjunto y esto se pone rojo.
      const posibles = [
        await ficha(),
        await ficha(sencillaId),
        await ficha(conPolloId),
        await ficha(conChicharronId),
      ];
      const informado = await catalogo();
      expect(informado).not.toBeNull();
      expect(posibles.some((c) => c !== null && Math.abs(c - informado!) < 0.01)).toBe(true);
    });

    it('ninguna variante cuesta MENOS que la receta base (las recetas de variante son aditivas)', async () => {
      const base = (await ficha())!;
      for (const sizeId of [sencillaId, conPolloId, conChicharronId]) {
        expect((await ficha(sizeId))!).toBeGreaterThanOrEqual(base);
      }
    });
  });

  describe('el costo con variantes que consume la pantalla', () => {
    it('trae una variante por tamaño, con el costo que dice su ficha', async () => {
      const fila = await catalogoConVariantes();
      expect(fila.variants).toHaveLength(3);
      for (const v of fila.variants) {
        // LA ley de esta etapa: el batch y la ficha son el MISMO número. Si se
        // separan, hay dos costeos y uno de los dos miente.
        expect(v.totalCost).toBeCloseTo((await ficha(v.sizeId))!, 2);
      }
    });

    it('la variante sin receta propia cuesta la base, y cada una lleva su recargo', async () => {
      const porNombre = new Map((await catalogoConVariantes()).variants.map((v) => [v.name, v]));
      expect(porNombre.get('Sencilla')!.totalCost).toBeCloseTo(COSTO_BASE, 2);
      expect(porNombre.get('Con pollo')!.totalCost).toBeCloseTo(COSTO_CON_POLLO, 2);
      expect(porNombre.get('Con chicharrón')!.totalCost).toBeCloseTo(COSTO_CON_CHICHARRON, 2);
      expect(porNombre.get('Con pollo')!.priceModifier).toBe(RECARGO_POLLO);
    });

    it('el costo base que informa es el MISMO que el del endpoint de siempre', async () => {
      // Aditivo de verdad: la ruta nueva no puede costear distinto que la vieja,
      // o la tabla y los reportes empezarían a decir cosas distintas.
      expect((await catalogoConVariantes()).totalCost).toBeCloseTo((await catalogo())!, 4);
    });

    it('una variante NO contamina a la de al lado ni a la receta base', async () => {
      // El cálculo cuelga las aristas de la variante del producto y las quita
      // después: si la limpieza fallara, la segunda variante saldría con la
      // proteína de la primera y la base con las dos.
      const fila = await catalogoConVariantes();
      const suma = fila.variants.reduce((a, v) => a + (v.totalCost ?? 0), 0);
      expect(suma).toBeCloseTo(COSTO_BASE + COSTO_CON_POLLO + COSTO_CON_CHICHARRON, 2);
      expect(fila.totalCost).toBeCloseTo(COSTO_BASE, 2);
    });

    it('un producto sin variantes viene con la lista vacía, no con una inventada', async () => {
      const res = await request.get('/product-costs/with-variants').set(auth()).expect(200);
      const otros = (res.body as Array<{ productId: string; variants: unknown[] }>).filter(
        (p) => p.productId !== productoId,
      );
      for (const p of otros) expect(p.variants).toEqual([]);
    });
  });

  describe('las pantallas costean la variante que se vendió', () => {
    /**
     * Lo que estas pruebas afirmaban hasta la Etapa 2 era el BUG: se vendían
     * $26.000 de comida que consumió $4.000 y las cuatro pantallas costeaban
     * $1.000. Ahora cada una costea la variante que de verdad salió.
     */
    it('la ganancia del pedido en el detalle del turno costea la variante vendida', async () => {
      const detalle = (
        await request.get(`/shifts/${shiftId}/detail`).set(auth()).expect(200)
      ).body as {
        orders: Array<{
          total: number;
          costTotal: number | null;
          items: Array<{ name: string; lineTotal: number; lineCost: number | null }>;
        }>;
      };
      const pedido = detalle.orders.find((o) => o.total === PRECIO_CON_POLLO);
      expect(pedido).toBeDefined();
      expect(pedido!.items[0].name).toContain('Con pollo');
      expect(pedido!.items[0].lineCost).toBeCloseTo(COSTO_CON_POLLO, 0);
      expect(pedido!.costTotal).toBeCloseTo(COSTO_CON_POLLO, 0);
    });

    it('el top de productos costea lo que se vendió, variante por variante', async () => {
      // Sin rango: el default del endpoint son 7 días, que cubre la venta de hoy.
      const res = await request.get('/reports/top-products?limit=50').set(auth()).expect(200);
      const fila = (
        res.body as { products: Array<{ productId: string; quantity: number; estCost: number | null }> }
      ).products.find((p) => p.productId === productoId);
      expect(fila).toBeDefined();
      expect(fila!.quantity).toBe(1);
      expect(fila!.estCost).toBeCloseTo(COSTO_CON_POLLO, 2);
    });

    it('el punto de equilibrio cuenta una línea por variante, con su precio y su costo', async () => {
      const m = await monthly();
      // Tres variantes = tres líneas de carta. La receta base NO entra: nadie
      // la puede comprar (y acá no hubo ventas sin elegir variante).
      expect(m.catalogBreakEven.productsConsidered).toBe(3);
      expect(m.catalogBreakEven.productsWithoutCost).toBe(0);
      // Se vendió UNA unidad, la de pollo: el promedio pesado por ventas es el
      // margen de esa variante, no el 95 % de la base.
      expect(m.catalogBreakEven.marginPct).toBeCloseTo(
        (PRECIO_CON_POLLO - COSTO_CON_POLLO) / PRECIO_CON_POLLO,
        4,
      );
      expect(m.catalogBreakEven.marginPct).toBeLessThan((PRECIO_BASE - COSTO_BASE) / PRECIO_BASE);
    });

    it('el que menos deja se nombra POR VARIANTE, que es lo que hay que mirar', async () => {
      const res = await request
        .get(`/reports/financial/monthly?${mesLocalQuery()}`)
        .set(auth())
        .expect(200);
      const c = (res.body as { catalogBreakEven: { worst: { name: string } | null } })
        .catalogBreakEven;
      expect(c.worst?.name).toContain('Con pollo');
    });

    it('la ruta vieja `/product-costs` sigue dando la BASE (no se le cambió la forma)', async () => {
      expect(await catalogo()).toBeCloseTo(COSTO_BASE, 2);
    });
  });

  describe('el ancla: lo que el cobro consumió DE VERDAD', () => {
    it('el COGS del mes cobra la variante completa ($4.000), no la base', async () => {
      // La columna vertebral está sana: `sales-consumption` y el ledger FIFO sí
      // pasan el sizeId. Este número NO se puede mover en ninguna etapa — si
      // cambia, el arreglo del estimado rompió el costeo real.
      expect(cogsDespuesDeVender - cogsAntesDeVender).toBeCloseTo(COSTO_CON_POLLO, 2);
    });

    it('lo que la app MUESTRA y lo que costó de verdad ya son el mismo número', async () => {
      // Era la brecha de $3.000 que abrió esta tanda de trabajo: el ledger
      // cobraba la variante y la pantalla mostraba la base.
      const detalle = (
        await request.get(`/shifts/${shiftId}/detail`).set(auth()).expect(200)
      ).body as { orders: Array<{ total: number; costTotal: number | null }> };
      const mostrado = detalle.orders.find((o) => o.total === PRECIO_CON_POLLO)!.costTotal!;
      expect(cogsDespuesDeVender - cogsAntesDeVender - mostrado).toBeCloseTo(0, 0);
    });
  });

  /**
   * Va al final a propósito: crea un segundo producto y las pruebas de arriba
   * afirman `productsConsidered === 1` sobre el equilibrio de la carta.
   */
  it('la ficha rechaza una variante que es de otro producto', async () => {
    const otro = await request
      .post('/products')
      .set(auth())
      .send({
        category: 'Test',
        name: 'Otro con variantes',
        basePrice: 9000,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
        sizes: [{ name: 'Único', priceModifier: 0, sortOrder: 0 }],
      })
      .expect(201);
    const ajena = (otro.body.sizes as Array<{ id: string }>)[0].id;

    await request
      .get(`/products/${productoId}/sizes/${ajena}/expanded-cost`)
      .set(auth())
      .expect(400);

    // Se desactiva para dejar la carta como estaba: el equilibrio solo mira
    // productos activos, y quien agregue una prueba después de esta no tiene
    // por qué heredar un producto de utilería en el promedio.
    await prisma.product.update({
      where: { id: otro.body.id as string },
      data: { isActive: false },
    });
  });
});
