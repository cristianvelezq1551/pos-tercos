/**
 * E2E de consumo de stock al vender — verifica la lógica ÚNICA compartida
 * entre confirmPayment (online) y syncOffline (computeConsumptionSpecs):
 *
 *  - preparado → insumos directos (con merma) + subproductos directos
 *  - reventa directa → stock propio del producto
 *  - combo → componentes
 *  - online y offline producen EXACTAMENTE el mismo consumo
 *  - stock insuficiente bloquea el cobro (409) sin crear movements
 *  - void revierte con movements compensatorios
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const APPROVAL_PIN = '654321';

describe('Consumo de stock E2E (online + offline)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;

  let panId: string;
  let carneId: string;
  let quesoId: string;
  let salsaId: string;
  let burgerId: string;
  let cocaId: string;
  let comboId: string;
  let quesudaId: string;
  let perroId: string;
  let dobleCarneId: string;

  async function movementsFor(saleId: string) {
    const rows = await prisma.inventoryMovement.findMany({
      where: { sourceType: 'sale', sourceId: saleId },
    });
    return rows.map((m) => ({
      entityType: m.entityType,
      entityId: m.ingredientId ?? m.productId ?? m.subproductId,
      delta: Number(m.delta),
      notes: m.notes,
    }));
  }

  async function createAndPay(productId: string, quantity: number): Promise<string> {
    const createRes = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity }] })
      .expect(201);
    const sale = createRes.body;
    await request
      .post(`/sales/${sale.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ method: 'CASH', amountReceived: Math.max(sale.total, 1) })
      .expect(201);
    return sale.id as string;
  }

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Auto-aislada: no confiar en que la suite anterior limpió. Esta suite lee
    // agregados GLOBALES (reportes / ledger de inventario), así que un residuo
    // de otra suite mueve los números y el fallo depende del orden de archivos.
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-cons@test.local',
          fullName: 'Dueño Consumo',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'cajero-cons@test.local',
          fullName: 'Cajero Consumo',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-cons@test.local');
    cajeroToken = await loginAs(request, 'cajero-cons@test.local');

    // PIN de aprobación del dueño (para void)
    await request
      .post('/approvals/pin')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ pin: APPROVAL_PIN, password: 'dev12345' })
      .expect((res) => {
        if (res.status >= 300) throw new Error(`PIN setup failed: ${res.status} ${JSON.stringify(res.body)}`);
      });

    // --- Catálogo ---
    const mkIngredient = async (body: object) => {
      const res = await request
        .post('/ingredients')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send(body)
        .expect(201);
      return res.body.id as string;
    };
    panId = await mkIngredient({
      name: 'Pan Consumo',
      unitPurchase: 'paquete',
      unitRecipe: 'unit',
      conversionFactor: 10,
    });
    carneId = await mkIngredient({
      name: 'Carne Consumo',
      unitPurchase: 'kg',
      unitRecipe: 'g',
      conversionFactor: 1000,
    });
    quesoId = await mkIngredient({
      name: 'Queso Consumo',
      unitPurchase: 'kg',
      unitRecipe: 'g',
      conversionFactor: 1000,
    });

    const salsaRes = await request
      .post('/subproducts')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ name: 'Salsa Consumo', yield: 10, unit: 'porción' })
      .expect(201);
    salsaId = salsaRes.body.id as string;

    const mkProduct = async (body: object) => {
      const res = await request
        .post('/products')
        .set('Authorization', `Bearer ${duenoToken}`)
        // La categoría es obligatoria al crear; acá es incidental al test.
        .send({ category: 'Test', ...body })
        .expect(201);
      return res.body.id as string;
    };
    burgerId = await mkProduct({
      name: 'Burger Consumo',
      basePrice: 15000,
      directResale: false,
      isCombo: false,
      modifiersEnabled: false,
    });
    quesudaId = await mkProduct({
      name: 'Quesuda Consumo',
      basePrice: 12000,
      directResale: false,
      isCombo: false,
      modifiersEnabled: false,
    });
    cocaId = await mkProduct({
      name: 'Coca Consumo',
      basePrice: 5000,
      directResale: true,
      unitPurchase: 'caja',
      unitStock: 'unit',
      conversionFactor: 24,
      modifiersEnabled: false,
    });
    comboId = await mkProduct({
      name: 'Combo Consumo',
      basePrice: 18000,
      isCombo: true,
      comboPrice: 18000,
      modifiersEnabled: false,
      comboComponents: [
        { productId: burgerId, quantity: 1 },
        { productId: cocaId, quantity: 1 },
      ],
    });

    // Recetas: burger = 1 pan + 150g carne (25% merma → 200g brutos) + 1 salsa
    await request
      .put(`/products/${burgerId}/recipe`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        edges: [
          { childType: 'ingredient', childId: panId, quantityNeta: 1 },
          { childType: 'ingredient', childId: carneId, quantityNeta: 150, mermaPct: 0.25 },
          { childType: 'subproduct', childId: salsaId, quantityNeta: 1 },
        ],
      })
      .expect(200);
    // quesuda = 2g queso (stock dejado corto a propósito para el 409)
    await request
      .put(`/products/${quesudaId}/recipe`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ edges: [{ childType: 'ingredient', childId: quesoId, quantityNeta: 2 }] })
      .expect(200);

    // --- Stock inicial ---
    const mkInitial = async (body: object) => {
      await request
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ type: 'INITIAL', ...body })
        .expect(201);
    };
    await mkInitial({ entityType: 'INGREDIENT', ingredientId: panId, delta: 100, unitCost: 500 });
    await mkInitial({ entityType: 'INGREDIENT', ingredientId: carneId, delta: 10000, unitCost: 30 });
    await mkInitial({ entityType: 'INGREDIENT', ingredientId: quesoId, delta: 1, unitCost: 40 });
    await mkInitial({ entityType: 'SUBPRODUCT', subproductId: salsaId, delta: 50, unitCost: 200 });
    await mkInitial({ entityType: 'PRODUCT', productId: cocaId, delta: 50, unitCost: 1500 });

    // Caja abierta para vender COUNTER
    await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ openingCash: 50000 })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('venta online de un preparado descuenta insumos directos (con merma) y subproducto', async () => {
    const saleId = await createAndPay(burgerId, 2);
    const movements = await movementsFor(saleId);

    expect(movements).toHaveLength(3);
    const pan = movements.find((m) => m.entityId === panId);
    const carne = movements.find((m) => m.entityId === carneId);
    const salsa = movements.find((m) => m.entityId === salsaId);
    expect(pan).toMatchObject({ entityType: 'INGREDIENT', delta: -2 });
    // 150g netos × 2 uds / (1 − 0.25) = 400g brutos
    expect(carne).toMatchObject({ entityType: 'INGREDIENT', delta: -400 });
    expect(salsa).toMatchObject({ entityType: 'SUBPRODUCT', delta: -2 });
  });

  it('venta online de reventa directa descuenta el stock propio del producto', async () => {
    const saleId = await createAndPay(cocaId, 3);
    const movements = await movementsFor(saleId);

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      entityType: 'PRODUCT',
      entityId: cocaId,
      delta: -3,
    });
  });

  it('combo descuenta los componentes (receta + reventa directa)', async () => {
    const saleId = await createAndPay(comboId, 1);
    const movements = await movementsFor(saleId);

    const byEntity = new Map(movements.map((m) => [m.entityId, m]));
    expect(byEntity.get(panId)?.delta).toBe(-1);
    expect(byEntity.get(carneId)?.delta).toBe(-200);
    expect(byEntity.get(salsaId)?.delta).toBe(-1);
    expect(byEntity.get(cocaId)).toMatchObject({ entityType: 'PRODUCT', delta: -1 });
    expect(movements).toHaveLength(4);
  });

  it('syncOffline genera EXACTAMENTE el mismo consumo que la venta online equivalente', async () => {
    // Online: 1 burger
    const onlineSaleId = await createAndPay(burgerId, 1);
    const online = await movementsFor(onlineSaleId);

    // Offline: 1 burger, mismos datos cobrados en la calle
    const syncRes = await request
      .post('/sales/sync-offline')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        localId: randomUUID(),
        provisionalNumber: 'OFF-1',
        soldOfflineAt: new Date().toISOString(),
        payment: { method: 'CASH', amountReceived: 15000, offlineVerified: true },
        payload: {
          type: 'COUNTER',
          customerName: null,
          lines: [
            {
              productId: burgerId,
              sizeId: null,
              quantity: 1,
              unitPrice: 15000,
              modifiers: [],
              lineSubtotal: 15000,
              lineDiscount: 0,
              lineTotal: 15000,
              appliedPromotionId: null,
            },
          ],
          subtotal: 15000,
          discount: 0,
          total: 15000,
        },
      })
      .expect(201);
    const offline = await movementsFor(syncRes.body.id as string);

    const normalize = (ms: Awaited<ReturnType<typeof movementsFor>>) =>
      ms
        .map((m) => ({ entityType: m.entityType, entityId: m.entityId, delta: m.delta }))
        .sort((a, b) => String(a.entityId).localeCompare(String(b.entityId)));

    expect(normalize(offline)).toEqual(normalize(online));
    // Las notas etiquetan el origen para auditoría
    expect(offline.every((m) => m.notes?.startsWith('Offline venta'))).toBe(true);
  });

  it('rechaza el cobro con 409 si el stock no alcanza y NO crea movements', async () => {
    // Quesuda necesita 2g de queso; hay 1g.
    const createRes = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: quesudaId, quantity: 1 }] })
      .expect(201);
    const saleId = createRes.body.id as string;

    await request
      .post(`/sales/${saleId}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ method: 'CASH', amountReceived: 12000 })
      .expect(409);

    // La venta sigue cobrable (no quedó PAGADO) y sin consumo
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(sale.status).toBe('PENDIENTE_PAGO');
    expect(await movementsFor(saleId)).toHaveLength(0);
  });

  it('void de una venta PAGADA revierte el stock con movements compensatorios', async () => {
    const saleId = await createAndPay(cocaId, 2);
    expect(await movementsFor(saleId)).toHaveLength(1); // -2

    await request
      .post(`/sales/${saleId}/void`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('X-Approval-Pin', APPROVAL_PIN)
      .send({ reason: 'Anulación de prueba e2e' })
      .expect((res) => {
        if (res.status >= 300) throw new Error(`void failed: ${res.status} ${JSON.stringify(res.body)}`);
      });

    const movements = await movementsFor(saleId);
    const total = movements.reduce((acc, m) => acc + m.delta, 0);
    expect(movements).toHaveLength(2); // -2 original + +2 compensatorio
    expect(total).toBe(0);
  });

  it('un extra con consumo (doble carne) descuenta la porción adicional, online y offline', async () => {
    // Producto con receta base (100g carne) + extra "Doble carne" (+150g).
    const prodRes = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Perro Consumo',
        category: 'Test',
        basePrice: 10000,
        directResale: false,
        isCombo: false,
        modifiersEnabled: true,
        modifiers: [
          {
            name: 'Doble carne',
            priceDelta: 4000,
            recipeDelta: [{ childType: 'ingredient', childId: carneId, quantity: 150 }],
          },
        ],
      })
      .expect(201);
    perroId = prodRes.body.id as string;
    const modifierId = prodRes.body.modifiers[0].id as string;
    dobleCarneId = modifierId;
    expect(prodRes.body.modifiers[0].recipeDelta).toEqual([
      { childType: 'ingredient', childId: carneId, quantity: 150 },
    ]);

    await request
      .put(`/products/${perroId}/recipe`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ edges: [{ childType: 'ingredient', childId: carneId, quantityNeta: 100 }] })
      .expect(200);

    // Online: 2 perros con doble carne → base 200g + extra 300g.
    const createRes = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'COUNTER',
        items: [{ productId: perroId, quantity: 2, modifiers: [{ modifierId }] }],
      })
      .expect(201);
    const sale = createRes.body;
    expect(sale.total).toBe(28000); // (10000 + 4000) × 2
    await request
      .post(`/sales/${sale.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ method: 'CASH', amountReceived: sale.total })
      .expect(201);

    const online = await movementsFor(sale.id as string);
    const carneTotal = online
      .filter((m) => m.entityId === carneId)
      .reduce((acc, m) => acc + m.delta, 0);
    expect(carneTotal).toBe(-500); // 200 base + 300 extra
    expect(online.some((m) => m.notes?.includes('extra "Doble carne"'))).toBe(true);

    // Offline: 1 perro con doble carne → mismo criterio (100 + 150).
    const syncRes = await request
      .post('/sales/sync-offline')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        localId: randomUUID(),
        provisionalNumber: 'OFF-2',
        soldOfflineAt: new Date().toISOString(),
        payment: { method: 'CASH', amountReceived: 14000, offlineVerified: true },
        payload: {
          type: 'COUNTER',
          customerName: null,
          lines: [
            {
              productId: perroId,
              sizeId: null,
              quantity: 1,
              unitPrice: 14000,
              modifiers: [{ modifierId, name: 'Doble carne', priceDelta: 4000 }],
              lineSubtotal: 14000,
              lineDiscount: 0,
              lineTotal: 14000,
              appliedPromotionId: null,
            },
          ],
          subtotal: 14000,
          discount: 0,
          total: 14000,
        },
      })
      .expect(201);
    const offline = await movementsFor(syncRes.body.id as string);
    const carneOffline = offline
      .filter((m) => m.entityId === carneId)
      .reduce((acc, m) => acc + m.delta, 0);
    expect(carneOffline).toBe(-250);
  });

  it('pedido WEB con adición: el cliente ve sus adiciones en el tracking público', async () => {
    const createRes = await request
      .post('/web/orders')
      .send({
        type: 'WEB_PICKUP',
        items: [{ productId: perroId, quantity: 1, modifiers: [{ modifierId: dobleCarneId }] }],
        customerName: 'Cliente Adición',
        customerPhone: '+573001234567',
      })
      .expect(201);
    expect(createRes.body.order.total).toBe(14000); // 10.000 + 4.000 del extra
    expect(createRes.body.order.items).toHaveLength(1);
    expect(createRes.body.order.items[0].modifiers).toEqual(['Doble carne']);

    // Tracking con token (lo que ve el cliente al recargar/compartir URL).
    const tracked = await request
      .get(`/web/orders/${createRes.body.order.id}?token=${encodeURIComponent(createRes.body.token)}`)
      .expect(200);
    expect(tracked.body.items[0].modifiers).toEqual(['Doble carne']);
    expect(tracked.body.items[0].productName).toBe('Perro Consumo');
  });

  it('GET /reports/inventory-usage refleja ventas, mermas y pérdida valorizada', async () => {
    // Darle costo conocido a la carne ($30.000/kg → $30/g) y declarar 100g de merma.
    await prisma.ingredient.update({
      where: { id: carneId },
      data: { lastUnitCost: 30000 },
    });
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        entityType: 'INGREDIENT',
        ingredientId: carneId,
        delta: -100,
        type: 'WASTE',
        notes: 'Se quemó una tanda',
      })
      .expect(201);

    const res = await request
      .get('/reports/inventory-usage')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);

    const carne = res.body.rows.find(
      (r: { entityId: string }) => r.entityId === carneId,
    );
    expect(carne).toBeDefined();
    expect(carne.waste).toBe(100);
    expect(carne.sales).toBeGreaterThan(0); // consumida por las ventas previas
    expect(carne.unitCost).toBe(30); // 30000 / 1000 (conversionFactor kg→g)
    expect(carne.wasteCost).toBe(3000); // 100g × $30
    expect(carne.wastePct).toBeGreaterThan(0);
    expect(res.body.totalWasteCost).toBeGreaterThanOrEqual(3000);
  });
});
