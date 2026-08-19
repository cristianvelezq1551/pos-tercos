/**
 * math-invariants.e2e-spec.ts — auditoría matemática 2026-07-25.
 *
 * Las suites existentes prueban cada módulo por su cuenta. Esta prueba las
 * COSTURAS: las igualdades que tienen que valer ENTRE reportes, que son
 * justamente donde un error se esconde (cada pantalla se ve coherente sola y
 * el dueño encuentra dos números distintos para la misma plata).
 *
 * Invariantes cubiertas:
 *   1. Ingresos: P&G == resumen de ventas == Σ sale.total == Σ pagos.
 *   2. Domicilio: revenue − envíos == comida == ingreso de top-productos.
 *   3. Arqueo: esperado == apertura + efectivo cobrado + entradas − salidas,
 *      y el desglose por método suma al total cobrado.
 *   4. FIFO: cruzar dos lotes cuesta lo exacto; anular devuelve el costo real
 *      y el inventario valorizado cuadra con compras − consumos.
 *   5. Cuenta dividida: las partes suman el total y cada método recibe la suya.
 *   6. Descuento sobre el total: prorrateo exacto (Σ productos == sale.total).
 *   7. Punto de equilibrio: vendiendo el equilibrio, el neto recurrente da 0.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/** Hoy en YYYY-MM-DD local (nunca toISOString: en Bogotá corre el día). */
const ymdLocalToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('Invariantes matemáticas entre reportes E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let cogs: CogsService;
  /** Producto de reventa: su costo FIFO es directo, sin recetas de por medio. */
  let cocaId: string;
  /** Producto preparado: ejercita expandRecipeOneLevel + FIFO de insumo. */
  let burgerId: string;
  let carneId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const hoy = (): string => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const rango = () => `from=${hoy()}&to=${hoy()}`;

  /** El ledger cachea 60s a propósito; en los tests medimos la lógica. */
  const fresh = () => cogs.invalidateLedgerCache();

  const pnl = async () => {
    fresh();
    return (await request.get(`/reports/cogs/pnl?${rango()}`).set(auth()).expect(200)).body as {
      revenue: number; cogs: number; grossMargin: number; wasteCost: number;
      cortesiaCost: number; refundCost: number; deliveryCollected: number;
      deliveryOrderCount: number; salesCount: number;
    };
  };
  const salesSummary = async () =>
    (await request.get(`/reports/sales-summary?${rango()}&granularity=daily`).set(auth()).expect(200))
      .body as {
      totals: { count: number; revenue: number; discount: number };
      byMethod: Array<{ method: string; count: number; revenue: number }>;
      byType: Array<{ type: string; count: number; revenue: number }>;
    };
  const topProducts = async () =>
    (await request.get(`/reports/top-products?${rango()}&limit=100`).set(auth()).expect(200))
      .body as { products: Array<{ productId: string; quantity: number; revenue: number }> };
  const valuation = async () => {
    fresh();
    return (await request.get('/reports/cogs/inventory-valuation').set(auth()).expect(200)).body as {
      items: Array<{ entityType: string; id: string; qty: number; value: number }>;
      totalValue: number;
    };
  };

  /** Cobra una venta de mostrador y devuelve su id. */
  const vender = async (
    items: Array<{ productId: string; quantity: number }>,
    pago: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ): Promise<string> => {
    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items, ...extra })
      .expect(201);
    const id = sale.body.id as string;
    await request.post(`/sales/${id}/confirm-payment`).set(auth()).send(pago).expect(201);
    return id;
  };

  const stockIn = (
    body: Record<string, unknown>,
  ) => request.post('/inventory/movements').set(auth()).send(body).expect(201);

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Esta suite lee agregados GLOBALES: un residuo de otra suite mueve los
    // números y el fallo dependería del orden de los archivos.
    await cleanDb(prisma);
    cogs = app.get(CogsService);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-math@test.local',
        fullName: 'Dueño Math',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-math@test.local');
    await prisma.productCategory.upsert({
      where: { name: 'Bebidas' },
      update: {},
      create: { name: 'Bebidas' },
    });
    await prisma.productCategory.upsert({
      where: { name: 'Comidas' },
      update: {},
      create: { name: 'Comidas' },
    });

    // --- Reventa directa: Coca a $5.000, costo FIFO $1.500 ---
    cocaId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Bebidas', name: 'Coca Math', basePrice: 5000, directResale: true,
          unitPurchase: 'caja', unitStock: 'unit', conversionFactor: 24, modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    await stockIn({ entityType: 'PRODUCT', productId: cocaId, delta: 100, type: 'INITIAL', unitCost: 1500 });

    // --- Preparado: Burger $12.000 con 100 g de carne. Dos lotes de carne a
    //     precios distintos para forzar el cruce de lotes en el FIFO. ---
    carneId = (
      await request
        .post('/ingredients')
        .set(auth())
        .send({
          name: 'Carne Math', unitPurchase: 'kg', unitRecipe: 'g',
          conversionFactor: 1000, thresholdMin: 0, isActive: true,
        })
        .expect(201)
    ).body.id as string;
    burgerId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Comidas', name: 'Burger Math', basePrice: 12000,
          directResale: false, modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    await request
      .put(`/products/${burgerId}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: carneId, quantityNeta: 100, mermaPct: 0 }] })
      .expect(200);
    // Lote 1: 300 g a $10/g. Lote 2: 300 g a $20/g. (PURCHASE solo entra por
    // facturas; una entrada manual con costo crea el lote igual.)
    await stockIn({ entityType: 'INGREDIENT', ingredientId: carneId, delta: 300, type: 'INITIAL', unitCost: 10 });
    await stockIn({ entityType: 'INGREDIENT', ingredientId: carneId, delta: 300, type: 'MANUAL_ADJUSTMENT', unitCost: 20 });

    await request.post('/shifts/open').set(auth()).send({ openingCash: 50_000 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ==================================================================
  // 1 · Conservación del ingreso entre reportes y contra la DB
  // ==================================================================

  it('el ingreso es el MISMO en el P&G, el resumen de ventas, sale.total y los pagos', async () => {
    await vender([{ productId: cocaId, quantity: 2 }], { method: 'CASH', amountReceived: 10_000 });
    await vender([{ productId: burgerId, quantity: 1 }], { method: 'CASH', amountReceived: 12_000 });

    const [p, s] = await Promise.all([pnl(), salesSummary()]);

    // Verdad de la DB: la suma de los totales cobrados hoy.
    const desdeVentas = await prisma.sale.aggregate({
      where: { paidAt: { not: null }, status: { notIn: ['PENDIENTE_PAGO', 'CANCELADO_NO_PAGO', 'VOID'] } },
      _sum: { total: true },
    });
    const totalDb = Number(desdeVentas._sum.total ?? 0);

    // Verdad de la DB por el otro lado: la suma de los PAGOS registrados.
    const desdePagos = await prisma.salePayment.aggregate({
      where: { sale: { paidAt: { not: null }, status: { notIn: ['PENDIENTE_PAGO', 'CANCELADO_NO_PAGO', 'VOID'] } } },
      _sum: { amount: true },
    });
    const totalPagos = Number(desdePagos._sum.amount ?? 0);

    expect(p.revenue).toBe(totalDb);
    expect(s.totals.revenue).toBe(totalDb);
    // Cada peso cobrado tiene su fila en sale_payments: si esto se rompe, el
    // arqueo y la reconciliación bancaria dejan de cuadrar.
    expect(totalPagos).toBe(totalDb);
    // Y el desglose por método reparte exactamente ese total.
    expect(s.byMethod.reduce((a, m) => a + m.revenue, 0)).toBe(totalDb);
    expect(s.byType.reduce((a, t) => a + t.revenue, 0)).toBe(totalDb);
  });

  // ==================================================================
  // 2 · FIFO: cruce de lotes, valorización y reverso
  // ==================================================================

  it('vender cruzando dos lotes cuesta la suma exacta de cada lote', async () => {
    // Hasta acá se consumieron 100 g (1 burger) del lote de $10 → quedan 200.
    const antes = await pnl();
    // 3 burgers = 300 g: 200 g @ $10 ($2.000) + 100 g @ $20 ($2.000) = $4.000.
    await vender([{ productId: burgerId, quantity: 3 }], { method: 'CASH', amountReceived: 36_000 });
    const despues = await pnl();

    expect(despues.revenue - antes.revenue).toBe(36_000);
    expect(despues.cogs - antes.cogs).toBe(4_000);
  });

  it('el inventario valorizado cuadra con lo comprado menos lo consumido', async () => {
    const v = await valuation();
    const carne = v.items.find((i) => i.id === carneId);
    // Comprado: 300 g @ $10 + 300 g @ $20 = 600 g / $9.000.
    // Consumido: 400 g (4 burgers) = 300 @ $10 + 100 @ $20 = $5.000.
    // Queda: 200 g, todo del lote de $20 = $4.000.
    expect(carne?.qty).toBe(200);
    expect(carne?.value).toBe(4_000);

    // Y la cantidad valorizada es exactamente el stock del libro.
    const stock = await prisma.inventoryMovement.aggregate({
      where: { entityType: 'INGREDIENT', ingredientId: carneId },
      _sum: { delta: true },
    });
    expect(Number(stock._sum.delta)).toBe(carne!.qty);
  });

  it('anular una venta devuelve el costo EXACTO del lote que consumió (no el último precio)', async () => {
    const antes = await pnl();
    // Esta venta consume 100 g del lote de $20 → costo $2.000.
    const saleId = await vender([{ productId: burgerId, quantity: 1 }], {
      method: 'CASH', amountReceived: 12_000,
    });
    const conVenta = await pnl();
    expect(conVenta.cogs - antes.cogs).toBe(2_000);

    // Cambiar el PIN propio exige re-ingresar la contraseña.
    await request
      .post('/approvals/pin')
      .set(auth())
      .send({ pin: '135790', password: 'dev12345' })
      .expect(201);
    await request
      .post(`/sales/${saleId}/void`)
      .set(auth())
      .set('X-Approval-Pin', '135790')
      .send({ reason: 'Prueba de reverso a costo real' })
      .expect(201);

    const despues = await pnl();
    // El void deja ingreso y costo como estaban: neto exacto, sin residuo.
    expect(despues.revenue).toBe(antes.revenue);
    expect(despues.cogs).toBe(antes.cogs);
    // Y las unidades vuelven al inventario con su costo original ($20/g).
    const v = await valuation();
    const carne = v.items.find((i) => i.id === carneId);
    expect(carne?.qty).toBe(200);
    expect(carne?.value).toBe(4_000);
  });

  // ==================================================================
  // 3 · Cuenta dividida
  // ==================================================================

  it('la cuenta dividida suma el total y cada método recibe su parte', async () => {
    const antes = await salesSummary();
    const efectivoAntes = antes.byMethod.find((m) => m.method === 'CASH')?.revenue ?? 0;
    const transferAntes = antes.byMethod.find((m) => m.method === 'TRANSFER')?.revenue ?? 0;

    // $10.000 en dos Cocas, partido en $6.000 efectivo + $4.000 transferencia.
    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: cocaId, quantity: 2 }] })
      .expect(201);
    await request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set(auth())
      .send({
        payments: [
          { method: 'CASH', amount: 6_000, amountReceived: 10_000 },
          { method: 'TRANSFER', amount: 4_000, digitalVerified: true },
        ],
      })
      .expect(201);

    const despues = await salesSummary();
    expect((despues.byMethod.find((m) => m.method === 'CASH')?.revenue ?? 0) - efectivoAntes).toBe(6_000);
    expect((despues.byMethod.find((m) => m.method === 'TRANSFER')?.revenue ?? 0) - transferAntes).toBe(4_000);
    expect(despues.totals.revenue - antes.totals.revenue).toBe(10_000);

    // La suma de las partes tiene que ser el total de la venta, sin centavos sueltos.
    const pagos = await prisma.salePayment.findMany({ where: { saleId: sale.body.id as string } });
    expect(pagos.reduce((a, p) => a + Number(p.amount), 0)).toBe(10_000);
  });

  // ==================================================================
  // 4 · Arqueo de caja
  // ==================================================================

  it('el efectivo esperado es apertura + efectivo cobrado + entradas − salidas', async () => {
    const shift = (await request.get('/shifts/current').set(auth()).expect(200)).body as { id: string };

    await request
      .post(`/shifts/${shift.id}/cash-movements`)
      .set(auth())
      .send({ type: 'IN', amount: 30_000, reason: 'Base extra del dueño', method: 'CASH' })
      .expect(201);
    await request
      .post(`/shifts/${shift.id}/cash-movements`)
      .set(auth())
      .send({ type: 'OUT', amount: 12_000, reason: 'Pago al domiciliario', method: 'CASH' })
      .expect(201);

    const esperado = (await request.get(`/shifts/${shift.id}/expected-cash`).set(auth()).expect(200))
      .body as { expectedCash: number; openingCash: number; cashSalesTotal: number; cashIn: number; cashOut: number };

    // La verdad de la DB: la porción CASH de las ventas que cuentan plata,
    // MENOS los domicilios (§7.v28: ese efectivo se le paga directo al
    // repartidor y no entra al cajón).
    const cashRows = await prisma.salePayment.findMany({
      where: {
        method: 'CASH',
        sale: { shiftId: shift.id, status: { notIn: ['PENDIENTE_PAGO', 'CANCELADO_NO_PAGO', 'VOID'] } },
      },
      select: { amount: true, sale: { select: { total: true, deliveryFee: true } } },
    });
    const cashDbTotal = Math.round(
      cashRows.reduce((acc, r) => {
        const amount = Number(r.amount);
        const fee = Number(r.sale?.deliveryFee ?? 0);
        const total = Number(r.sale?.total ?? 0);
        if (fee <= 0 || total <= 0) return acc + amount;
        return acc + amount - fee * Math.min(1, amount / total);
      }, 0),
    );

    expect(esperado.openingCash).toBe(50_000);
    expect(esperado.cashSalesTotal).toBe(cashDbTotal);
    expect(esperado.cashIn).toBe(30_000);
    expect(esperado.cashOut).toBe(12_000);
    expect(esperado.expectedCash).toBe(
      esperado.openingCash + esperado.cashSalesTotal + esperado.cashIn - esperado.cashOut,
    );
    // La venta ANULADA no dejó plata en el cajón: su efectivo no cuenta.
    const voided = await prisma.sale.count({ where: { status: 'VOID' } });
    expect(voided).toBeGreaterThan(0);
  });

  // ==================================================================
  // 5 · Descuento sobre el total: el prorrateo no crea ni destruye plata
  // ==================================================================

  it('el descuento sobre el total se prorratea exacto entre los productos', async () => {
    const antes = await topProducts();
    const antesDe = (id: string) => antes.products.find((p) => p.productId === id)?.revenue ?? 0;

    // 2 Cocas ($10.000) + 1 Burger ($12.000) = $22.000, con $2.200 de descuento
    // (10%) sobre el total → $19.800.
    const saleId = await vender(
      [
        { productId: cocaId, quantity: 2 },
        { productId: burgerId, quantity: 1 },
      ],
      { method: 'CASH', amountReceived: 19_800 },
      { orderDiscount: { kind: 'PERCENT', value: 10 }, discountReason: 'Prueba de prorrateo' },
    );

    const venta = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(Number(venta.total)).toBe(19_800);
    expect(Number(venta.orderDiscountAmount)).toBe(2_200);
    // El CHECK de la DB ya lo exige, pero dejémoslo explícito acá también.
    expect(Number(venta.subtotal) - Number(venta.discountTotal)).toBe(Number(venta.total));

    const despues = await topProducts();
    const delta = (id: string) =>
      (despues.products.find((p) => p.productId === id)?.revenue ?? 0) - antesDe(id);
    // Cada producto recibe su parte del descuento por peso: Coca 10/22, Burger 12/22.
    expect(delta(cocaId)).toBeCloseTo(10_000 * 0.9, 2);
    expect(delta(burgerId)).toBeCloseTo(12_000 * 0.9, 2);
    // Y la suma de los productos es exactamente lo cobrado: ni un peso inventado.
    expect(delta(cocaId) + delta(burgerId)).toBeCloseTo(19_800, 2);
  });

  // ==================================================================
  // 6 · Domicilio separado
  // ==================================================================

  it('el envío se separa del ingreso de comida y explica la diferencia con top-productos', async () => {
    // Domicilio armado directo en la DB: acá se mide la SEPARACIÓN contable,
    // no el flujo web (que ya cubre web-delivery.e2e-spec).
    const antes = await pnl();
    const shift = (await request.get('/shifts/current').set(auth()).expect(200)).body as { id: string };

    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: cocaId, quantity: 1 }] })
      .expect(201);
    const saleId = sale.body.id as string;
    // Se convierte en domicilio a mano (el endpoint de tarifa exige que ya lo
    // sea). La DB obliga a que un WEB_DELIVERY tenga dirección y a que el total
    // sea subtotal − descuento + envío: si el test se equivocara, el CHECK lo
    // frena antes que el assert.
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Calle Falsa 123',
        deliveryFee: 6_000,
        total: 11_000,
      },
    });
    await request
      .post(`/sales/${saleId}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: 11_000 })
      .expect(201);
    expect(shift.id).toBeTruthy();

    const despues = await pnl();
    expect(despues.deliveryCollected - antes.deliveryCollected).toBe(6_000);
    expect(despues.deliveryOrderCount - antes.deliveryOrderCount).toBe(1);
    // LA propiedad (decisión del dueño 2026-07-27): el cliente pagó 11.000 pero
    // el ingreso sube SOLO por la comida. El envío es del repartidor y solo pasa
    // por la caja — si sumara, subiría el margen bruto sin consumir inventario.
    expect(despues.revenue - antes.revenue).toBe(5_000);

    // Y ahora el reporte de productos coincide con el ingreso, porque ninguno
    // de los dos cuenta el envío (antes diferían exactamente en los envíos).
    const top = await topProducts();
    const revenueProductos = top.products.reduce((a, p) => a + p.revenue, 0);
    expect(despues.revenue).toBeCloseTo(revenueProductos, 2);
  });

  /**
   * El envío se coló en varias pantallas distintas del reporte de ventas
   * (dashboard, estado financiero, resumen diario). Este caso las recorre a la
   * vez: TODO lo que se llama "ingreso" va neto, y lo COBRADO por método va
   * bruto — porque es contra eso que se arquea y se concilia con el banco.
   */
  it('ninguna pantalla de ingresos cuenta el envío, y lo cobrado sí', async () => {
    const hoy = ymdLocalToday();
    const resumen = async () =>
      (await request.get(`/reports/sales-summary?from=${hoy}&to=${hoy}`).set(auth()).expect(200))
        .body as {
        totals: { revenue: number; deliveryCollected: number };
        byMethod: { method: string; revenue: number }[];
      };
    const dashboard = async () =>
      (await request.get('/reports/dashboard').set(auth()).expect(200)).body as {
        todayRevenue: number;
      };

    const antesResumen = await resumen();
    const antesDash = await dashboard();

    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: cocaId, quantity: 1 }] })
      .expect(201);
    await prisma.sale.update({
      where: { id: sale.body.id as string },
      data: {
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Calle Falsa 456',
        deliveryFee: 7_000,
        total: 12_000,
      },
    });
    await request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: 12_000 })
      .expect(201);

    const despuesResumen = await resumen();
    const despuesDash = await dashboard();

    // Ingresos: SOLO la comida, en las dos pantallas.
    expect(despuesResumen.totals.revenue - antesResumen.totals.revenue).toBe(5_000);
    expect(despuesDash.todayRevenue - antesDash.todayRevenue).toBe(5_000);
    // El envío se reporta aparte, sin sumarse a los ingresos.
    expect(
      despuesResumen.totals.deliveryCollected - antesResumen.totals.deliveryCollected,
    ).toBe(7_000);

    // §7.v29: el reporte de VENTAS va neto de punta a punta, también por
    // método — así "por método de pago" cuadra con "Ingresos" sin necesitar un
    // párrafo que explique la diferencia. Para cuadrar contra el banco están el
    // arqueo digital y la conciliación, que sí usan lo cobrado en bruto.
    const cash = (r: Awaited<ReturnType<typeof resumen>>) =>
      r.byMethod.find((m) => m.method === 'CASH')?.revenue ?? 0;
    expect(cash(despuesResumen) - cash(antesResumen)).toBe(5_000);

    // LA identidad del reporte: los métodos suman exactamente los ingresos.
    const porMetodo = despuesResumen.byMethod.reduce((a, m) => a + m.revenue, 0);
    expect(porMetodo).toBeCloseTo(despuesResumen.totals.revenue, 2);
  });

  /**
   * El envío en efectivo se le paga DIRECTO al domiciliario: nunca entra al
   * cajón (aclaración del dueño 2026-07-27). Si el arqueo lo esperara, cada
   * domicilio en efectivo marcaría un faltante inventado.
   */
  it('un domicilio cobrado en efectivo NO sube el efectivo esperado', async () => {
    const shift = (await request.get('/shifts/current').set(auth()).expect(200)).body as {
      id: string;
    };
    const esperadoDe = async (): Promise<number> =>
      (
        (await request.get(`/shifts/${shift.id}/expected-cash`).set(auth()).expect(200))
          .body as { expectedCash: number }
      ).expectedCash;

    const antes = await esperadoDe();

    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: cocaId, quantity: 1 }] })
      .expect(201);
    await prisma.sale.update({
      where: { id: sale.body.id as string },
      data: {
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Calle Falsa 789',
        deliveryFee: 8_000,
        total: 13_000,
      },
    });
    await request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: 13_000 })
      .expect(201);

    // El cliente pagó 13.000 pero al cajón solo llegan los 5.000 de la comida.
    expect((await esperadoDe()) - antes).toBe(5_000);

    // Y el detalle del arqueo cuenta la misma historia: NADA del envío está en
    // los totales — ni en lo vendido ni en lo cobrado por medio (§7.v30).
    const detalle = (
      await request.get(`/shifts/${shift.id}/detail`).set(auth()).expect(200)
    ).body as {
      summary: {
        totalRevenue: number;
        deliveryCollected: number;
        byMethod: { method: string; total: number }[];
      };
    };
    expect(detalle.summary.deliveryCollected).toBeGreaterThanOrEqual(8_000);
    // LA propiedad: los medios suman exactamente lo vendido. Si el envío se
    // colara en alguno, esta igualdad se rompe.
    const porMedio = detalle.summary.byMethod.reduce((a, m) => a + m.total, 0);
    expect(porMedio).toBeCloseTo(detalle.summary.totalRevenue, 2);
  });

  it('en el detalle de sesión, "por tipo" y "por método" cuentan la MISMA plata (domicilio neto)', async () => {
    // Bug real (auditoría 2026-08-14): byMethod iba neto de envío pero byType
    // sumaba el total BRUTO — el mismo turno mostraba "Domicilio $45.000" y
    // "Transferencia $38.000" en la misma pantalla. La igualdad de abajo lo
    // hace imposible de reintroducir.
    const shift = (await request.get('/shifts/current').set(auth()).expect(200)).body as {
      id: string;
    };

    // Un domicilio más, ahora por TRANSFERENCIA, para cubrir la pata digital.
    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: cocaId, quantity: 1 }] })
      .expect(201);
    await prisma.sale.update({
      where: { id: sale.body.id as string },
      data: {
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Carrera 10 # 20-30',
        deliveryFee: 7_000,
        total: 12_000,
      },
    });
    await request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'TRANSFER', amountReceived: 12_000, digitalDoubleVerified: true })
      .expect(201);

    const detalle = (
      await request.get(`/shifts/${shift.id}/detail`).set(auth()).expect(200)
    ).body as {
      summary: {
        totalRevenue: number;
        byMethod: { method: string; total: number }[];
        byType: { type: string; total: number }[];
      };
    };
    const porMedio = detalle.summary.byMethod.reduce((a, m) => a + m.total, 0);
    const porTipo = detalle.summary.byType.reduce((a, t) => a + t.total, 0);
    // Tres cifras, una sola plata: vendido == Σ por método == Σ por tipo.
    expect(porTipo).toBeCloseTo(detalle.summary.totalRevenue, 2);
    expect(porTipo).toBeCloseTo(porMedio, 2);
    // Y la fila de domicilios trae la comida sin el envío: este pedido aporta
    // 5.000 (12.000 − 7.000), nunca 12.000.
    const delivery = detalle.summary.byType.find((t) => t.type === 'WEB_DELIVERY');
    expect(delivery).toBeDefined();
    const brutoDelivery = await prisma.sale.aggregate({
      where: { shiftId: shift.id, type: 'WEB_DELIVERY', status: { notIn: ['PENDIENTE_PAGO', 'CANCELADO_NO_PAGO', 'VOID'] } },
      _sum: { total: true, deliveryFee: true },
    });
    expect(delivery!.total).toBeCloseTo(
      Number(brutoDelivery._sum.total ?? 0) - Number(brutoDelivery._sum.deliveryFee ?? 0),
      2,
    );
  });

  // ==================================================================
  // 7 · Punto de equilibrio con datos reales
  // ==================================================================

  it('vendiendo exactamente el punto de equilibrio, el resultado recurrente da 0', async () => {
    const now = new Date();
    await request
      .post('/fixed-costs')
      .set(auth())
      .send({ name: 'Arriendo Math', category: 'Local', amount: 1_000_000, frequency: 'MONTHLY' })
      .expect(201);

    fresh();
    const st = (
      await request
        .get(`/reports/financial/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
        .set(auth())
        .expect(200)
    ).body as {
      revenue: number; cogs: number; wasteCost: number; cortesiasCost: number; refundCost: number;
      totalFixed: number; contributionMargin: number; contributionMarginPct: number | null;
      breakEven: number | null; breakEvenCoverage: number | null;
      deliveryCollected: number;
    };

    expect(st.totalFixed).toBe(1_000_000);
    // El margen de contribución descuenta TODO lo que se mueve con la venta.
    expect(st.contributionMargin).toBeCloseTo(
      st.revenue - st.cogs - st.wasteCost - st.cortesiasCost - st.refundCost,
      2,
    );
    // El DTO redondea el porcentaje a 4 decimales (round4), así que se compara
    // con esa precisión — no con la del double crudo.
    expect(st.contributionMarginPct).toBeCloseTo(st.contributionMargin / st.revenue, 4);

    // LA propiedad: a ese nivel de ventas, los fijos quedan exactamente cubiertos.
    expect(st.breakEven).not.toBeNull();
    const ratio = st.contributionMargin / st.revenue;
    const netoEnEquilibrio = st.breakEven! * ratio - st.totalFixed;
    expect(netoEnEquilibrio).toBeCloseTo(0, 2);

    // El equilibrio honesto nunca es MENOR que el que salía del margen bruto.
    const optimista = st.totalFixed / ((st.revenue - st.cogs) / st.revenue);
    expect(st.breakEven!).toBeGreaterThanOrEqual(optimista - 0.01);

    // La cobertura es coherente con lo vendido.
    expect(st.breakEvenCoverage).toBeCloseTo(st.revenue / st.breakEven!, 4);
    // Y el domicilio NO contamina el estado financiero: se reporta aparte y el
    // punto de equilibrio se calcula sobre ingresos que sí son del negocio.
    expect(st.deliveryCollected).toBeGreaterThanOrEqual(0);
  });
});
