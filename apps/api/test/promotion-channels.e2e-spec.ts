/**
 * promotion-channels.e2e-spec.ts — Canal de promociones (caja / web / ambos):
 *  - Una promo solo-WEB no descuenta en COUNTER; una solo-POS no descuenta en
 *    pedidos web. BOTH (default) descuenta en ambos canales.
 *  - GET /web/menu expone solo promos WEB/BOTH (subset público).
 *  - GET /promotions?channel=POS filtra las solo-web (lista del POS).
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Promotion Channels E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;

  let webOnlyProductId: string; // promo solo-WEB 20%
  let posOnlyProductId: string; // promo solo-POS 30%
  let bothProductId: string; // promo BOTH (default) 10%

  let webPromoId: string;
  let posPromoId: string;
  let bothPromoId: string;

  const PRICE = 10_000;

  /** Fire-and-forget del WhatsApp: esperar la fila para no deadlockear el TRUNCATE. */
  const waitForWhatsApp = async (saleId: string, stage: string, tries = 25) => {
    for (let i = 0; i < tries; i++) {
      const msg = await prisma.whatsAppMessage.findFirst({ where: { saleId, stage } });
      if (msg) return msg;
      await new Promise((r) => setTimeout(r, 40));
    }
    return null;
  };

  const createProduct = async (name: string): Promise<string> => {
    const res = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name,
        category: 'Bebidas',
        basePrice: PRICE,
        isActive: true,
        directResale: true,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'unit',
        unitStock: 'unit',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    const id = res.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'PRODUCT', productId: id, delta: 50, type: 'INITIAL', notes: 'stock test' })
      .expect(201);
    return id;
  };

  const createPromo = async (
    name: string,
    productId: string,
    discountPct: number,
    channel?: string,
  ): Promise<string> => {
    const res = await request
      .post('/promotions')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name,
        type: 'PERCENT_OFF',
        discountPct,
        daysOfWeekMask: 127,
        timeStart: '00:00:00',
        timeEnd: '23:59:59',
        productIds: [productId],
        ...(channel ? { channel } : {}),
      })
      .expect(201);
    return res.body.id as string;
  };

  const counterSale = async (productId: string) => {
    const res = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
      .expect(201);
    return res.body as { id: string; total: number; discountTotal: number };
  };

  const webOrder = async (productId: string, phone: string) => {
    const res = await request
      .post('/web/orders')
      .send({
        type: 'WEB_PICKUP',
        items: [{ productId, quantity: 1 }],
        customerName: 'Cliente Promo',
        customerPhone: phone,
      })
      .expect(201);
    const order = res.body.order as { id: string; total: number; discountTotal: number };
    await waitForWhatsApp(order.id, 'payment_instructions');
    return order;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-promoch@test.local', fullName: 'Dueño PromoCh', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-promoch@test.local', fullName: 'Cajero PromoCh', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-promoch@test.local');
    cajeroToken = await loginAs(request, 'cajero-promoch@test.local');

    webOnlyProductId = await createProduct('Gaseosa Solo Web');
    posOnlyProductId = await createProduct('Gaseosa Solo Caja');
    bothProductId = await createProduct('Gaseosa Ambos');

    webPromoId = await createPromo('Promo web 20%', webOnlyProductId, 0.2, 'WEB');
    posPromoId = await createPromo('Promo caja 30%', posOnlyProductId, 0.3, 'POS');
    bothPromoId = await createPromo('Promo ambos 10%', bothProductId, 0.1); // sin channel → BOTH

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

  it('channel default es BOTH al crear sin especificar', async () => {
    const res = await request
      .get(`/promotions/${bothPromoId}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(res.body.channel).toBe('BOTH');
  });

  it('venta COUNTER: aplica solo-POS y BOTH, ignora solo-WEB', async () => {
    const noPromo = await counterSale(webOnlyProductId);
    expect(noPromo.discountTotal).toBe(0);
    expect(noPromo.total).toBe(PRICE);

    const posPromo = await counterSale(posOnlyProductId);
    expect(posPromo.discountTotal).toBe(PRICE * 0.3);

    const bothPromo = await counterSale(bothProductId);
    expect(bothPromo.discountTotal).toBe(PRICE * 0.1);
  });

  it('pedido web: aplica solo-WEB y BOTH, ignora solo-POS', async () => {
    const webPromo = await webOrder(webOnlyProductId, '+573001110001');
    expect(webPromo.discountTotal).toBe(PRICE * 0.2);
    expect(webPromo.total).toBe(PRICE * 0.8);

    const noPromo = await webOrder(posOnlyProductId, '+573001110002');
    expect(noPromo.discountTotal).toBe(0);
    expect(noPromo.total).toBe(PRICE);

    const bothPromo = await webOrder(bothProductId, '+573001110003');
    expect(bothPromo.discountTotal).toBe(PRICE * 0.1);
  });

  it('GET /web/menu expone solo promos WEB/BOTH', async () => {
    const res = await request.get('/web/menu').expect(200);
    const ids = (res.body.promotions as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(webPromoId);
    expect(ids).toContain(bothPromoId);
    expect(ids).not.toContain(posPromoId);
    // Subset SAFE: definición completa para calcular el precio, sin metadata interna.
    const webPromo = (res.body.promotions as Record<string, unknown>[]).find(
      (p) => p.id === webPromoId,
    );
    expect(webPromo).toMatchObject({ type: 'PERCENT_OFF', discountPct: 0.2 });
    expect(webPromo).not.toHaveProperty('createdById');
  });

  it('GET /promotions?channel=POS filtra las solo-web (lista del POS)', async () => {
    const res = await request
      .get('/promotions?only_active=true&channel=POS')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(200);
    const ids = (res.body as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(posPromoId);
    expect(ids).toContain(bothPromoId);
    expect(ids).not.toContain(webPromoId);
  });

  it('PATCH /promotions/:id permite cambiar el canal (campo meta)', async () => {
    const res = await request
      .patch(`/promotions/${webPromoId}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ channel: 'BOTH' })
      .expect(200);
    expect(res.body.channel).toBe('BOTH');

    // Revertir para no afectar otros tests (orden de ejecución).
    await request
      .patch(`/promotions/${webPromoId}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ channel: 'WEB' })
      .expect(200);
  });
});
