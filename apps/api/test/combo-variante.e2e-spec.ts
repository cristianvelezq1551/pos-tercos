/**
 * E2E del combo cuyos componentes llevan VARIANTE ("2 Papas TERCOS · Pollo").
 *
 * El hueco que cierra: un componente de combo no guardaba la variante, y los
 * platos con variantes tienen la proteína en la receta de la VARIANTE. Un combo
 * "Papas × 2" descontaba y costeaba solo papas y salsas — el pollo no salía del
 * inventario y el margen se veía ~20 puntos mejor de lo real.
 *
 * Las pruebas comparan contra algo que YA funciona en prod hace meses: vender
 * los mismos platos SUELTOS, con su variante. Un combo tiene que descontar y
 * costar exactamente lo que cuestan sus componentes por separado (L3 y L4 del
 * PLAN-COMBO-CON-VARIANTE.md). Y el combo SIN variantes tiene que seguir
 * comportándose como siempre.
 *
 * Números elegidos para que el error sea visible y redondo:
 *   Papa $10/g · Pollo $30/g · Carne $40/g · Pan $500 · Empaque $300 ·
 *   Salsa (subproducto) $5/g · Gaseosa $1.000
 *   Papas, receta base:  200 g papa + 1 empaque              = $2.300
 *   + variante Pollo:    100 g pollo con 20 % de merma (125 g) = $3.750
 *                        + 30 g de salsa                        =   $150  → $6.200
 *   + variante Carne:    100 g carne                            = $4.000  → $6.300
 *   Sandwich:            1 pan + 80 g carne                     = $3.700
 *   "2 Papas · Pollo"    = 2 × $6.200                           = $12.400  (con el error: $4.600)
 *   "Combo mixto"        = Papas·Pollo + Papas·Carne + Sandwich + Gaseosa = $17.200  (con el error: $9.300)
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

const APPROVAL_PIN = '481516';

const COSTO_PAPAS_BASE = 2300;
const COSTO_PAPAS_POLLO = 6200;
const COSTO_PAPAS_CARNE = 6300;
const COSTO_SANDWICH = 3700;
const COSTO_GASEOSA = 1000;
const COSTO_DOS_POLLO = 2 * COSTO_PAPAS_POLLO;
const COSTO_MIXTO = COSTO_PAPAS_POLLO + COSTO_PAPAS_CARNE + COSTO_SANDWICH + COSTO_GASEOSA;
const COSTO_FIJO = COSTO_SANDWICH + COSTO_GASEOSA;

const PRECIO_DOS_POLLO = 40_000;
const PRECIO_MIXTO = 50_000;
const PRECIO_FIJO = 20_000;

type Neto = Map<string, number>;

describe('Combo con componentes con variante E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let cogs: CogsService;
  let token: string;
  let shiftId: string;

  let papaId: string;
  let polloId: string;
  let carneId: string;
  let panId: string;
  let empaqueId: string;
  let baseSalsaId: string;
  let salsaId: string;

  let papasId: string;
  let tamPolloId: string;
  let tamCarneId: string;
  let sandwichId: string;
  let gaseosaId: string;

  let dosPolloId: string;
  let mixtoId: string;
  let fijoId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Neto descontado por stockable (`TIPO:id` → delta) de una venta o cortesía. */
  async function netoDe(sourceType: 'sale' | 'cortesia', sourceId: string): Promise<Neto> {
    const rows = await prisma.inventoryMovement.findMany({ where: { sourceType, sourceId } });
    const neto: Neto = new Map();
    for (const m of rows) {
      const clave = `${m.entityType}:${m.ingredientId ?? m.productId ?? m.subproductId}`;
      neto.set(clave, (neto.get(clave) ?? 0) + Number(m.delta));
    }
    // Lo que se descontó y se devolvió entero no cuenta como consumo.
    for (const [k, v] of neto) if (Math.abs(v) < 1e-9) neto.delete(k);
    return neto;
  }

  /** Dos consumos son el MISMO: mismas cosas, mismas cantidades. */
  function mismoConsumo(real: Neto, esperado: Neto): void {
    expect([...real.keys()].sort()).toEqual([...esperado.keys()].sort());
    for (const [k, v] of esperado) expect(real.get(k)).toBeCloseTo(v, 4);
  }

  const ing = (id: string) => `INGREDIENT:${id}`;
  const sub = (id: string) => `SUBPRODUCT:${id}`;
  const prod = (id: string) => `PRODUCT:${id}`;

  /** Sin `async`: devuelve el encadenable de supertest para poder `.expect(...)`. */
  function crearVenta(items: object[]) {
    return request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items });
  }

  async function venderYCobrar(items: object[]): Promise<{ id: string; total: number }> {
    const res = await crearVenta(items).expect(201);
    await request
      .post(`/sales/${res.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: Math.max(res.body.total, 1) })
      .expect(201);
    return { id: res.body.id as string, total: res.body.total as number };
  }

  /** El ledger FIFO cachea 60 s: en un test se lee fresco. */
  const cogsDelMes = async (): Promise<number> => {
    cogs.invalidateLedgerCache();
    const res = await request.get(`/reports/financial/monthly?${mesLocalQuery()}`).set(auth()).expect(200);
    return (res.body as { cogs: number }).cogs;
  };

  const fichaDe = async (productId: string, sizeId?: string): Promise<number | null> => {
    const url = sizeId
      ? `/products/${productId}/sizes/${sizeId}/expanded-cost`
      : `/products/${productId}/expanded-cost`;
    const res = await request.get(url).set(auth()).expect(200);
    return (res.body as { totalCost: number | null }).totalCost;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Lee agregados GLOBALES (equilibrio, márgenes, COGS del mes): un residuo de
    // otra suite movería los números.
    await cleanDb(prisma);
    cogs = app.get(CogsService);

    await prisma.user.create({
      data: {
        email: 'dueno-combovar@test.local',
        fullName: 'Dueño Combo Variante',
        role: 'DUENO',
        passwordHash: await bcrypt.hash('dev12345', 10),
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-combovar@test.local');
    await request
      .post('/approvals/pin')
      .set(auth())
      .send({ pin: APPROVAL_PIN, password: 'dev12345' })
      .expect((res) => {
        if (res.status >= 300) throw new Error(`PIN: ${res.status} ${JSON.stringify(res.body)}`);
      });

    // --- Insumos, con el costo de referencia fijado y stock al MISMO costo FIFO.
    const insumo = async (
      name: string,
      compra: { unidad: string; receta: string; factor: number; costoCompra: number; stock: number },
      extra: object = {},
    ): Promise<string> => {
      const res = await request
        .post('/ingredients')
        .set(auth())
        .send({
          name,
          unitPurchase: compra.unidad,
          unitRecipe: compra.receta,
          conversionFactor: compra.factor,
          ...extra,
        })
        .expect(201);
      const id = res.body.id as string;
      await prisma.ingredient.update({ where: { id }, data: { lastUnitCost: compra.costoCompra } });
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({
          type: 'INITIAL',
          entityType: 'INGREDIENT',
          ingredientId: id,
          delta: compra.stock,
          unitCost: compra.costoCompra / compra.factor,
        })
        .expect(201);
      return id;
    };
    const porKilo = (costoKilo: number) => ({
      unidad: 'kg',
      receta: 'g',
      factor: 1000,
      costoCompra: costoKilo,
      stock: 100_000,
    });
    papaId = await insumo('Papa CV', porKilo(10_000));
    polloId = await insumo('Pollo CV', porKilo(30_000));
    carneId = await insumo('Carne CV', porKilo(40_000));
    baseSalsaId = await insumo('Base salsa CV', porKilo(5_000));
    panId = await insumo('Pan CV', { unidad: 'paquete', receta: 'unidad', factor: 10, costoCompra: 5000, stock: 1000 });
    // Consumible: se descuenta y se costea, pero no frena la venta.
    empaqueId = await insumo(
      'Empaque CV',
      { unidad: 'unidad', receta: 'unidad', factor: 1, costoCompra: 300, stock: 1000 },
      { blocksAvailability: false },
    );

    // --- Subproducto en la receta de la variante: el camino que usa prod.
    salsaId = (
      await request.post('/subproducts').set(auth()).send({ name: 'Salsa CV', yield: 1000, unit: 'g' }).expect(201)
    ).body.id as string;
    await request
      .put(`/subproducts/${salsaId}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: baseSalsaId, quantityNeta: 1000 }] })
      .expect(200);
    await request
      .post(`/subproducts/${salsaId}/produce`)
      .set(auth())
      .send({ quantityProduced: 5000, idempotencyKey: randomUUID() })
      .expect(201);

    // --- Papas con tres variantes y receta ADITIVA por variante.
    const papas = await request
      .post('/products')
      .set(auth())
      .send({
        category: 'Test',
        name: 'Papas CV',
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
          { childType: 'ingredient', childId: papaId, quantityNeta: 200, mermaPct: 0 },
          { childType: 'ingredient', childId: empaqueId, quantityNeta: 1, mermaPct: 0 },
        ],
      })
      .expect(200);
    await request
      .put(`/products/${papasId}/sizes/${tamPolloId}/recipe`)
      .set(auth())
      .send({
        edges: [
          { childType: 'ingredient', childId: polloId, quantityNeta: 100, mermaPct: 0.2 },
          { childType: 'subproduct', childId: salsaId, quantityNeta: 30, mermaPct: 0 },
        ],
      })
      .expect(200);
    await request
      .put(`/products/${papasId}/sizes/${tamCarneId}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: carneId, quantityNeta: 100, mermaPct: 0 }] })
      .expect(200);

    // --- Sandwich sin variantes y gaseosa de reventa.
    sandwichId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Test',
          name: 'Sandwich CV',
          basePrice: 18_000,
          directResale: false,
          isCombo: false,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    await request
      .put(`/products/${sandwichId}/recipe`)
      .set(auth())
      .send({
        edges: [
          { childType: 'ingredient', childId: panId, quantityNeta: 1, mermaPct: 0 },
          { childType: 'ingredient', childId: carneId, quantityNeta: 80, mermaPct: 0 },
        ],
      })
      .expect(200);
    gaseosaId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Test',
          name: 'Gaseosa CV',
          basePrice: 5000,
          directResale: true,
          unitPurchase: 'caja',
          unitStock: 'unidad',
          conversionFactor: 24,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    await prisma.product.update({ where: { id: gaseosaId }, data: { lastUnitCost: 24_000 } });
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ type: 'INITIAL', entityType: 'PRODUCT', productId: gaseosaId, delta: 500, unitCost: 1000 })
      .expect(201);

    // --- Los tres combos.
    const combo = async (name: string, precio: number, comboComponents: object[]) =>
      (
        await request
          .post('/products')
          .set(auth())
          .send({
            category: 'Test',
            name,
            basePrice: precio,
            isCombo: true,
            comboPrice: precio,
            modifiersEnabled: false,
            comboComponents,
          })
          .expect(201)
      ).body.id as string;
    dosPolloId = await combo('2 Papas Pollo CV', PRECIO_DOS_POLLO, [
      { productId: papasId, sizeId: tamPolloId, quantity: 2 },
    ]);
    mixtoId = await combo('Combo mixto CV', PRECIO_MIXTO, [
      { productId: papasId, sizeId: tamPolloId, quantity: 1 },
      { productId: papasId, sizeId: tamCarneId, quantity: 1 },
      { productId: sandwichId, quantity: 1 },
      { productId: gaseosaId, quantity: 1 },
    ]);
    // Control de regresión: un combo como el único que hay en prod hoy.
    fijoId = await combo('Combo fijo CV', PRECIO_FIJO, [
      { productId: sandwichId, quantity: 1 },
      { productId: gaseosaId, quantity: 1 },
    ]);

    const caja = await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
    shiftId = caja.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('el combo guarda la variante de cada componente', () => {
    it('la ficha del producto devuelve el componente con su variante', async () => {
      const res = await request.get(`/products/${dosPolloId}`).set(auth()).expect(200);
      expect(res.body.comboComponents).toEqual([
        expect.objectContaining({ productId: papasId, sizeId: tamPolloId, quantity: 2 }),
      ]);
    });

    it('un componente sin variantes no inventa una', async () => {
      const res = await request.get(`/products/${fijoId}`).set(auth()).expect(200);
      for (const c of res.body.comboComponents as Array<{ sizeId?: string | null }>) {
        expect(c.sizeId ?? null).toBeNull();
      }
    });
  });

  describe('L3 — el combo descuenta lo mismo que sus componentes vendidos SUELTOS', () => {
    it('"2 Papas · Pollo" descuenta la base Y la variante, dos veces', async () => {
      const venta = await venderYCobrar([{ productId: dosPolloId, quantity: 1 }]);
      mismoConsumo(
        await netoDe('sale', venta.id),
        new Map([
          [ing(papaId), -400],
          [ing(empaqueId), -2],
          [ing(polloId), -250], // 2 × 100 g con 20 % de merma
          [sub(salsaId), -60],
        ]),
      );
    });

    it('es idéntico a vender 2 Papas · Pollo sueltas', async () => {
      const combo = await venderYCobrar([{ productId: dosPolloId, quantity: 1 }]);
      const sueltas = await venderYCobrar([{ productId: papasId, sizeId: tamPolloId, quantity: 2 }]);
      mismoConsumo(await netoDe('sale', combo.id), await netoDe('sale', sueltas.id));
    });

    it('escala con la cantidad de la línea (3 combos = 6 papas)', async () => {
      const combo = await venderYCobrar([{ productId: dosPolloId, quantity: 3 }]);
      const sueltas = await venderYCobrar([{ productId: papasId, sizeId: tamPolloId, quantity: 6 }]);
      mismoConsumo(await netoDe('sale', combo.id), await netoDe('sale', sueltas.id));
    });

    it('un combo MIXTO (dos variantes, otro plato y una bebida) es idéntico a venderlos sueltos', async () => {
      const combo = await venderYCobrar([{ productId: mixtoId, quantity: 1 }]);
      const sueltas = await venderYCobrar([
        { productId: papasId, sizeId: tamPolloId, quantity: 1 },
        { productId: papasId, sizeId: tamCarneId, quantity: 1 },
        { productId: sandwichId, quantity: 1 },
        { productId: gaseosaId, quantity: 1 },
      ]);
      mismoConsumo(await netoDe('sale', combo.id), await netoDe('sale', sueltas.id));
    });

    it('editar un pedido cobrado (1 → 2 combos) ajusta como si fueran 4 papas sueltas', async () => {
      const venta = await venderYCobrar([{ productId: dosPolloId, quantity: 1 }]);
      await request
        .patch(`/sales/${venta.id}/items`)
        .set(auth())
        .send({ items: [{ productId: dosPolloId, quantity: 2 }] })
        .expect(200);
      const sueltas = await venderYCobrar([{ productId: papasId, sizeId: tamPolloId, quantity: 4 }]);
      mismoConsumo(await netoDe('sale', venta.id), await netoDe('sale', sueltas.id));
    });

    it('la venta SIN CONEXIÓN descuenta igual que la online', async () => {
      const online = await venderYCobrar([{ productId: dosPolloId, quantity: 1 }]);
      const sync = await request
        .post('/sales/sync-offline')
        .set(auth())
        .send({
          localId: randomUUID(),
          provisionalNumber: 'OFF-CV-1',
          soldOfflineAt: new Date().toISOString(),
          payment: { method: 'CASH', amountReceived: PRECIO_DOS_POLLO, offlineVerified: true },
          payload: {
            type: 'COUNTER',
            customerName: null,
            lines: [
              {
                productId: dosPolloId,
                sizeId: null,
                quantity: 1,
                unitPrice: PRECIO_DOS_POLLO,
                modifiers: [],
                lineSubtotal: PRECIO_DOS_POLLO,
                lineDiscount: 0,
                lineTotal: PRECIO_DOS_POLLO,
                appliedPromotionId: null,
              },
            ],
            subtotal: PRECIO_DOS_POLLO,
            discount: 0,
            total: PRECIO_DOS_POLLO,
          },
        })
        .expect(201);
      mismoConsumo(await netoDe('sale', sync.body.id as string), await netoDe('sale', online.id));
    });

    it('regalar el combo (cortesía) descuenta lo mismo que venderlo', async () => {
      const cortesia = await request
        .post('/cortesias')
        .set(auth())
        .send({ productId: dosPolloId, quantity: 1, reason: 'Prueba de combo con variante' })
        .expect(201);
      const venta = await venderYCobrar([{ productId: dosPolloId, quantity: 1 }]);
      mismoConsumo(await netoDe('cortesia', cortesia.body.id as string), await netoDe('sale', venta.id));
    });

    it('REGRESIÓN: un combo sin variantes descuenta exactamente como siempre', async () => {
      const venta = await venderYCobrar([{ productId: fijoId, quantity: 2 }]);
      expect(venta.total).toBe(2 * PRECIO_FIJO);
      mismoConsumo(
        await netoDe('sale', venta.id),
        new Map([
          [ing(panId), -2],
          [ing(carneId), -160],
          [prod(gaseosaId), -2],
        ]),
      );
    });
  });

  describe('L7 — anular deja el inventario en cero', () => {
    it('anular el combo devuelve TODO lo que descontó, proteína incluida', async () => {
      const venta = await venderYCobrar([{ productId: dosPolloId, quantity: 1 }]);
      expect((await netoDe('sale', venta.id)).get(ing(polloId))).toBeCloseTo(-250, 4);

      await request
        .post(`/sales/${venta.id}/void`)
        .set(auth())
        .set('X-Approval-Pin', APPROVAL_PIN)
        .send({ reason: 'Anulación de prueba del combo con variante' })
        .expect((res) => {
          if (res.status >= 300) throw new Error(`void: ${res.status} ${JSON.stringify(res.body)}`);
        });

      expect((await netoDe('sale', venta.id)).size).toBe(0);
    });
  });

  describe('L4 — un solo costo en todas las pantallas', () => {
    it('la referencia: cada plato suelto cuesta lo que dicen sus insumos', async () => {
      expect(await fichaDe(papasId)).toBeCloseTo(COSTO_PAPAS_BASE, 2);
      expect(await fichaDe(papasId, tamPolloId)).toBeCloseTo(COSTO_PAPAS_POLLO, 2);
      expect(await fichaDe(papasId, tamCarneId)).toBeCloseTo(COSTO_PAPAS_CARNE, 2);
      expect(await fichaDe(sandwichId)).toBeCloseTo(COSTO_SANDWICH, 2);
    });

    it('la ficha del combo suma cada componente CON su variante', async () => {
      expect(await fichaDe(dosPolloId)).toBeCloseTo(COSTO_DOS_POLLO, 2);
      expect(await fichaDe(mixtoId)).toBeCloseTo(COSTO_MIXTO, 2);
      expect(await fichaDe(fijoId)).toBeCloseTo(COSTO_FIJO, 2);
    });

    it('la ficha del combo nombra la variante de cada componente', async () => {
      const res = await request.get(`/products/${dosPolloId}/expanded-cost`).set(auth()).expect(200);
      const comp = (res.body.components as Array<{ productName: string; unitCost: number }>)[0];
      expect(comp.productName).toContain('Pollo');
      expect(comp.unitCost).toBeCloseTo(COSTO_PAPAS_POLLO, 2);
    });

    it('la tabla de productos dice lo MISMO que la ficha (las dos rutas)', async () => {
      for (const ruta of ['/product-costs', '/product-costs/with-variants']) {
        const res = await request.get(ruta).set(auth()).expect(200);
        const porId = new Map(
          (res.body as Array<{ productId: string; totalCost: number | null }>).map((c) => [c.productId, c.totalCost]),
        );
        expect(porId.get(dosPolloId)).toBeCloseTo(COSTO_DOS_POLLO, 2);
        expect(porId.get(mixtoId)).toBeCloseTo(COSTO_MIXTO, 2);
        expect(porId.get(fijoId)).toBeCloseTo(COSTO_FIJO, 2);
      }
    });

    it('la ganancia del pedido en el detalle del turno costea la variante', async () => {
      const venta = await venderYCobrar([{ productId: mixtoId, quantity: 1 }]);
      const detalle = (await request.get(`/shifts/${shiftId}/detail`).set(auth()).expect(200)).body as {
        orders: Array<{ id: string; costTotal: number | null }>;
      };
      const pedido = detalle.orders.find((o) => o.id === venta.id);
      expect(pedido).toBeDefined();
      expect(pedido!.costTotal).toBeCloseTo(COSTO_MIXTO, 0);
    });

    it('el top de productos costea el combo por lo que lleva', async () => {
      const res = await request.get('/reports/top-products?limit=50').set(auth()).expect(200);
      const fila = (
        res.body as { products: Array<{ productId: string; quantity: number; estCost: number | null }> }
      ).products.find((p) => p.productId === dosPolloId);
      expect(fila).toBeDefined();
      expect(fila!.estCost).toBeCloseTo(COSTO_DOS_POLLO * fila!.quantity, 0);
    });

    it('el margen por producto (costo FIFO real) cobra la variante', async () => {
      cogs.invalidateLedgerCache();
      const res = await request.get('/reports/cogs/product-margins').set(auth()).expect(200);
      const fila = (
        res.body as { products: Array<{ productId: string; unitsSold: number; cogs: number; cogsPartial: boolean }> }
      ).products.find((p) => p.productId === dosPolloId);
      expect(fila).toBeDefined();
      expect(fila!.cogsPartial).toBe(false);
      expect(fila!.cogs).toBeCloseTo(COSTO_DOS_POLLO * fila!.unitsSold, 0);
    });

    it('el equilibrio de la carta costea los combos con su variante', async () => {
      // Con estos precios, el combo mixto es el que menos deja (65,6 %). Con el
      // error de hoy costaría $9.300 (81,4 %) y el peor sería otro plato.
      const res = await request.get(`/reports/financial/monthly?${mesLocalQuery()}`).set(auth()).expect(200);
      const c = (res.body as {
        catalogBreakEven: { worst: { name: string; marginPct: number } | null; productsWithoutCost: number };
      }).catalogBreakEven;
      expect(c.productsWithoutCost).toBe(0);
      expect(c.worst?.name).toBe('Combo mixto CV');
      expect(c.worst?.marginPct).toBeCloseTo((PRECIO_MIXTO - COSTO_MIXTO) / PRECIO_MIXTO, 4);
    });

    it('la cortesía cuesta el combo con su variante: el estimado y el FIFO real', async () => {
      const res = await request
        .post('/cortesias')
        .set(auth())
        .send({ productId: dosPolloId, quantity: 1, reason: 'Costo de la cortesía con variante' })
        .expect(201);
      // El estimado sale de la ficha; el real, del inventario que salió.
      expect(res.body.costAmount).toBeCloseTo(COSTO_DOS_POLLO, 2);
      cogs.invalidateLedgerCache();
      const lista = await request.get('/cortesias').set(auth()).expect(200);
      const real = (lista.body as Array<{ id: string; fifoCost?: number | null }>).find(
        (c) => c.id === res.body.id,
      );
      expect(real?.fifoCost).toBeCloseTo(COSTO_DOS_POLLO, 2);
    });

    it('el ANCLA: vender un combo sube el costo de lo vendido del mes exactamente lo que cuesta', async () => {
      const antes = await cogsDelMes();
      await venderYCobrar([{ productId: dosPolloId, quantity: 1 }]);
      expect((await cogsDelMes()) - antes).toBeCloseTo(COSTO_DOS_POLLO, 2);
    });
  });
});
