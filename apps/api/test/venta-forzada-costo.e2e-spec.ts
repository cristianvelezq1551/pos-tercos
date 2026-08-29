/**
 * venta-forzada-costo.e2e-spec.ts — la plata de vender sin stock.
 *
 * `force-available.e2e-spec.ts` ya prueba la MECÁNICA (que se pueda cobrar y
 * que el inventario quede en negativo). Lo que falta probar por la API es lo
 * que le importa al dueño: **cuánto costó** ese plato que se vendió sin tener
 * el insumo cargado.
 *
 * La regla (§7.v32) es que nada se asume en cero: el faltante se valora al
 * último precio conocido y queda como DEUDA, y la próxima compra lo corrige al
 * costo REAL. Sin eso, vender sin haber cargado la factura sale gratis y el
 * margen queda inflado justo cuando peor conviene.
 *
 * El costo estimado se declara como tal (`cogsEstimatedQty`): un estimado
 * presentado como exacto es el mismo problema que el $0, porque el dueño lee
 * una cifra cerrada.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { hoyLocal } from './helpers/local-day';

describe('Vender sin stock: el costo se estima y la factura lo corrige', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let cogs: CogsService;
  let insumoId: string;
  let productoId: string;

  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });
  const rango = (): string => `from=${hoyLocal()}&to=${hoyLocal()}`;

  /** El ledger cachea 60 s; acá se mide la lógica, no la caché. */
  const pnl = async (): Promise<{
    cogs: number;
    cogsUnknownQty: number;
    cogsEstimatedQty: number;
    grossMargin: number;
    revenue: number;
  }> => {
    cogs.invalidateLedgerCache();
    const res = await request.get(`/reports/cogs/pnl?${rango()}`).set(auth()).expect(200);
    return res.body;
  };

  /** Cobra una venta de mostrador y devuelve su id. */
  const vender = async (cantidad: number, total: number): Promise<string> => {
    const creada = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: productoId, quantity: cantidad }] })
      .expect(201);
    const id = creada.body.id as string;
    await request
      .post(`/sales/${id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: total })
      .expect(201);
    return id;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Lee agregados GLOBALES: un residuo de otra suite mueve los números.
    await cleanDb(prisma);
    cogs = app.get(CogsService);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-forzada@test.local',
        fullName: 'Dueño Forzada',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-forzada@test.local');

    insumoId = (
      await request
        .post('/ingredients')
        .set(auth())
        .send({
          name: 'Carne Forzada',
          unitPurchase: 'kg',
          unitRecipe: 'g',
          conversionFactor: 1000,
          thresholdMin: 0,
          isActive: true,
        })
        .expect(201)
    ).body.id as string;

    productoId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Comidas',
          name: 'Plato Forzado',
          basePrice: 20_000,
          directResale: false,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    // 100 g de carne por plato, sin merma: las cuentas quedan a la vista.
    await request
      .put(`/products/${productoId}/recipe`)
      .set(auth())
      .send({
        edges: [{ childType: 'ingredient', childId: insumoId, quantityNeta: 100, mermaPct: 0 }],
      })
      .expect(200);
    await request
      .post(`/products/${productoId}/force-available`)
      .set(auth())
      .send({ forceAvailable: true })
      .expect(201);

    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('vender sin haber comprado nunca NO cuesta $0: queda declarado como desconocido', async () => {
    // Sin una sola compra previa y sin costo en el catálogo no hay con qué
    // estimar. Ahí el sistema tiene que decir "no sé", que es DISTINTO de $0:
    // el cero afirma que el insumo era gratis.
    await vender(1, 20_000);

    const p = await pnl();
    expect(p.revenue).toBe(20_000);
    expect(p.cogsUnknownQty).toBeGreaterThan(0);
    // Y lo que no se pudo costear no se cuela como margen ganado.
    expect(p.cogs).toBe(0);

    const stock = (
      await request.get(`/inventory/stock/ingredient/${insumoId}`).set(auth()).expect(200)
    ).body as { currentStock: number };
    expect(stock.currentStock).toBe(-100);
  });

  it('con un precio conocido, el faltante se ESTIMA y se declara estimado (nunca $0)', async () => {
    // Se compra a $30/g: ahora hay una referencia. Se consume todo y se vuelve
    // a vender en negativo — ese segundo plato se costea al último precio.
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({
        entityType: 'INGREDIENT',
        ingredientId: insumoId,
        delta: 100,
        type: 'INITIAL',
        unitCost: 30,
      })
      .expect(201);

    // OJO con la cuenta: esos 100 g comprados NO quedan en la nevera. Van a
    // saldar la deuda que dejó el plato del caso anterior (100 g en descubierto),
    // que recién ahí queda costeado — a $30, el precio real de la compra.
    const antes = await pnl();
    await vender(2, 40_000); // 200 g, y el inventario ya estaba en 0
    const despues = await pnl();

    // Los 200 g se venden enteramente a crédito y se estiman al último precio
    // conocido: 200 × $30 = $6.000.
    expect(despues.cogs - antes.cogs).toBeCloseTo(6000, 2);
    // Y el sistema AVISA que parte de ese número es estimado.
    expect(despues.cogsEstimatedQty).toBeGreaterThan(0);
  });

  it('la factura posterior corrige el estimado al costo REAL, sin contar doble', async () => {
    const antes = await pnl();
    const estimadoAntes = antes.cogsEstimatedQty;
    expect(estimadoAntes).toBeGreaterThan(0);

    // Deuda viva: los 200 g del caso anterior, estimados a $30.
    // Llega la factura de esa carne y en realidad costó $50/g. La deuda se
    // salda al precio REAL y el costo del período se ajusta por la diferencia,
    // imputada a la fecha del CONSUMO y no a la de la factura (si cayera en el
    // mes de la compra, el mes que vendió el plato quedaría barato para siempre).
    await request
      .post('/invoices/manual')
      .set(auth())
      .send({
        supplierNit: '901234567',
        supplierName: 'Proveedor Forzada',
        invoiceNumber: 'FORZ-1',
        total: 500 * 50, // 500 g a $50/g
        items: [
          {
            entityType: 'INGREDIENT',
            ingredientId: insumoId,
            descriptionRaw: 'Carne 0,5 kg',
            quantity: 0.5,
            unit: 'kg',
            unitPrice: 50_000,
            total: 25_000,
          },
        ],
      })
      .expect(201);

    const despues = await pnl();

    // Los 200 g estimados a $30 costaron $50: el COGS sube 200 × $20 = $4.000.
    expect(despues.cogs - antes.cogs).toBeCloseTo(4000, 2);
    // Ya no queda nada estimado: la deuda se saldó con un precio real.
    expect(despues.cogsEstimatedQty).toBe(0);

    // Y las unidades fantasma salieron del inventario: entraron 500 g y 200
    // taparon el descubierto → quedan 300 g. Si la deuda no se descontara, el
    // sistema diría que hay 500 g de carne que nadie va a encontrar.
    const stock = (
      await request.get(`/inventory/stock/ingredient/${insumoId}`).set(auth()).expect(200)
    ).body as { currentStock: number };
    expect(stock.currentStock).toBe(300);
  });

  it('el inventario valorizado no cuenta las unidades que todavía se deben', async () => {
    cogs.invalidateLedgerCache();
    const val = (
      await request.get('/reports/cogs/inventory-valuation').set(auth()).expect(200)
    ).body as { items: Array<{ id: string; qty: number; value: number }>; totalValue: number };

    const fila = val.items.find((i) => i.id === insumoId);
    expect(fila).toBeDefined();
    // 300 g a $50 = $15.000. Si la valuación contara las unidades en descubierto
    // como si existieran, el inventario valdría más de lo que hay en la nevera.
    expect(fila!.qty).toBeCloseTo(300, 4);
    expect(fila!.value).toBeCloseTo(15_000, 2);
  });
});
