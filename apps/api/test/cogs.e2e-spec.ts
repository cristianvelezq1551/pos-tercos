import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AppContext, bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/**
 * E2E del flujo de costeo real FIFO por HTTP punta a punta:
 *   compra (factura) → captura de unit_cost → venta → confirmPayment descuenta
 *   stock → reportes COGS. Verifica números exactos contra una DB sembrada.
 */
describe('COGS FIFO (e2e HTTP)', () => {
  let ctx: AppContext;
  let token: string;
  let duenoId: string;
  let polloId: string;
  let burgerId: string;

  beforeAll(async () => {
    ctx = await bootstrapApp();
    // Usuario propio: no depender del seed (otras suites truncan `users`).
    const hash = await bcrypt.hash('dev12345', 10);
    const dueno = await ctx.prisma.user.upsert({
      where: { email: 'dueno-cogs@test.local' },
      update: {},
      create: {
        email: 'dueno-cogs@test.local',
        fullName: 'Dueño COGS',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoId = dueno.id;
    token = await loginAs(ctx.request, 'dueno-cogs@test.local');
  });

  afterAll(async () => {
    // Caja única por negocio: si esta suite deja su caja OPEN, la siguiente
    // no puede abrir la suya. Limpiar es obligatorio.
    await cleanDb(ctx.prisma);
    await ctx.app.close();
  });

  const auth = <T extends { set: (k: string, v: string) => T }>(r: T): T =>
    r.set('Authorization', `Bearer ${token}`);

  async function confirmInvoice(qtyKg: number, unitPricePerKg: number): Promise<void> {
    // Seed de un draft (normalmente lo crea el upload con IA); confirmamos vía HTTP.
    const draft = await ctx.prisma.invoice.create({ data: { uploadedById: duenoId } });
    const total = qtyKg * unitPricePerKg;
    await auth(ctx.request.post(`/invoices/${draft.id}/confirm`))
      .send({
        supplierNit: '900123456-7',
        supplierName: 'Proveedor e2e',
        total,
        items: [
          {
            entityType: 'INGREDIENT',
            ingredientId: polloId,
            descriptionRaw: 'Pollo',
            quantity: qtyKg,
            unit: 'kg',
            unitPrice: unitPricePerKg,
            total,
          },
        ],
      })
      .expect(201);
  }

  async function sellOneBurger(): Promise<void> {
    const created = await auth(ctx.request.post('/sales'))
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: burgerId, quantity: 1 }] })
      .expect(201);
    const saleId = created.body.id as string;
    const total = Number(created.body.total);
    await auth(ctx.request.post(`/sales/${saleId}/confirm-payment`))
      .send({ method: 'CASH', amountReceived: total })
      .expect(201);
  }

  it('captura costo en compras, descuenta FIFO al vender y reporta COGS exacto', async () => {
    // 1. Insumo + producto con receta (1 burger = 600 g de pollo).
    polloId = (
      await auth(ctx.request.post('/ingredients'))
        .send({ name: 'Pollo e2e', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0 })
        .expect(201)
    ).body.id;

    burgerId = (
      await auth(ctx.request.post('/products'))
        .send({ name: 'Burger e2e', basePrice: 9000 })
        .expect(201)
    ).body.id;

    await auth(ctx.request.put(`/products/${burgerId}/recipe`))
      .send({ edges: [{ childType: 'ingredient', childId: polloId, quantityNeta: 600, mermaPct: 0 }] })
      .expect(200);

    // 2. Dos compras a distinto precio → 1000 g @ $10/g y 1000 g @ $20/g.
    await confirmInvoice(1, 10000); // (1 kg × $10.000)/1000 g = $10/g
    await confirmInvoice(1, 20000); // $20/g

    // 3. La captura: los movimientos de compra guardan unit_cost.
    const purchases = await ctx.prisma.inventoryMovement.findMany({
      where: { ingredientId: polloId, type: 'PURCHASE' },
      orderBy: { createdAt: 'asc' },
    });
    expect(purchases.map((p) => Number(p.unitCost))).toEqual([10, 20]);

    // 4. Abrir caja y vender 2 hamburguesas (600 g c/u → cruza lotes).
    await auth(ctx.request.post('/shifts/open')).send({ openingCash: 0 }).expect(201);
    await sellOneBurger(); // 600 @ 10 = 6.000
    await sellOneBurger(); // 400 @ 10 + 200 @ 20 = 8.000

    // 5. P&L: ventas 18.000, costo real 14.000, ganancia 4.000.
    const pnl = (await auth(ctx.request.get('/reports/cogs/pnl')).expect(200)).body;
    expect(pnl.revenue).toBe(18000);
    expect(pnl.cogs).toBe(14000);
    expect(pnl.grossMargin).toBe(4000);
    expect(pnl.cogsUnknownQty).toBe(0);

    // 6. Margen real por producto.
    const margins = (await auth(ctx.request.get('/reports/cogs/product-margins')).expect(200)).body;
    const burger = margins.products.find((p: { productId: string }) => p.productId === burgerId);
    expect(burger.revenue).toBe(18000);
    expect(burger.cogs).toBe(14000);
    expect(burger.margin).toBe(4000);
    expect(burger.cogsPartial).toBe(false);

    // 7. Inventario valorizado: quedan 800 g @ $20 = $16.000.
    const val = (await auth(ctx.request.get('/reports/cogs/inventory-valuation')).expect(200)).body;
    const pollo = val.items.find((i: { id: string }) => i.id === polloId);
    expect(pollo.qty).toBe(800);
    expect(pollo.value).toBe(16000);
  });
});
