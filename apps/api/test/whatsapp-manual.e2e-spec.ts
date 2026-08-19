/**
 * E2E del aviso MANUAL por WhatsApp (§7.v22).
 *
 * Premisa de esta suite: NO hay proveedor de WhatsApp configurado — el estado
 * real de dev y prod hoy (sin KAPSO_*). El mock declara `delivers:false`, así
 * que el sistema no envía nada y —esto es lo que se prueba— tampoco finge que
 * envió. El aviso lo manda el cajero abriendo el chat con `wa.me`.
 *
 * El camino AUTOMÁTICO (con proveedor real) se prueba en `web-delivery`, que
 * inyecta un proveedor que sí entrega.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const LOCAL = '6.1658173,-75.580882';
const CERCA = { customerLat: 6.1705, customerLng: -75.5835 };
const DIRECCION = 'Cra 43A #5-15, torre 2, apto 502';

describe('Aviso manual por WhatsApp E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let productId: string;

  const auth = () => ({ Authorization: `Bearer ${duenoToken}` });

  const phone = () =>
    `+57302${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

  const order = (body: Record<string, unknown>) =>
    request
      .post('/web/orders')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId, quantity: 1 }],
        customerName: 'Cliente Manual',
        customerPhone: phone(),
        ...body,
      });

  beforeAll(async () => {
    // Solo el throttler: el WhatsAppProvider queda como está (el mock que NO
    // entrega), porque justamente eso es lo que esta suite verifica.
    ({ app, prisma, request } = await bootstrapApp((b) =>
      b.overrideProvider(ThrottlerStorage).useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 60,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      }),
    ));
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-wa@test.local',
        fullName: 'Dueño WA',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-wa@test.local');

    await prisma.productCategory.upsert({
      where: { name: 'Bebidas' },
      update: {},
      create: { name: 'Bebidas' },
    });
    const prod = await request
      .post('/products')
      .set(auth())
      .send({
        name: 'Coca WA',
        category: 'Bebidas',
        basePrice: 5000,
        directResale: true,
        unitPurchase: 'caja',
        unitStock: 'unit',
        conversionFactor: 24,
        modifiersEnabled: false,
      })
      .expect(201);
    productId = prod.body.id as string;
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: 500, type: 'INITIAL', unitCost: 1500 })
      .expect(201);

    await request
      .patch('/business-config')
      .set(auth())
      .send({ coords: LOCAL, orderRadiusKm: 10, deliveryEnabled: true })
      .expect(200);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  /**
   * Sin proveedor real (no hay KAPSO_* en test), el sistema NO puede avisarle
   * nada al cliente. Antes fingía que sí: el mock devolvía ok y quedaba una
   * fila `status:'sent'`. Ahora el aviso lo manda el cajero por wa.me.
   */
  describe('el aviso al cliente es manual', () => {
    const conEnvio = async (): Promise<string> => {
      const created = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: DIRECCION,
        ...CERCA,
      }).expect(201);
      const saleId = created.body.order.id as string;
      await request.patch(`/sales/${saleId}/delivery-fee`).set(auth()).send({ fee: 7000 }).expect(200);
      return saleId;
    };

    it('asignar el envío ya NO registra un mensaje enviado', async () => {
      const saleId = await conEnvio();
      await new Promise((r) => setTimeout(r, 300));
      const msgs = await prisma.whatsAppMessage.findMany({ where: { saleId } });
      expect(msgs).toHaveLength(0);

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.notified_payment_instructions).toBe(false);
    });

    it('el link lleva el total con el desglose comida + domicilio', async () => {
      const saleId = await conEnvio();
      const res = await request
        .post(`/sales/${saleId}/whatsapp/payment_instructions`)
        .set(auth())
        .expect(201);

      expect(res.body.url).toMatch(/^https:\/\/wa\.me\/57\d{10}\?text=/);
      expect(res.body.messagePlain).toContain('$12.000'); // 5.000 comida + 7.000 envío
      expect(res.body.messagePlain).toContain('$5.000 del pedido');
      expect(res.body.messagePlain).toContain('$7.000 de domicilio');
    });

    it('queda registrado como MANUAL, no como enviado por el sistema', async () => {
      const saleId = await conEnvio();
      await request
        .post(`/sales/${saleId}/whatsapp/payment_instructions`)
        .set(auth())
        .expect(201);

      const msg = await prisma.whatsAppMessage.findFirstOrThrow({ where: { saleId } });
      expect(msg.status).toBe('manual');
      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.notified_payment_instructions).toBe(true);
    });

    it('el estado del aviso viaja en la venta para que la caja lo muestre', async () => {
      const saleId = await conEnvio();
      const antes = await request.get(`/sales/${saleId}`).set(auth()).expect(200);
      expect(antes.body.notified.paymentInstructions).toBe(false);

      await request
        .post(`/sales/${saleId}/whatsapp/payment_instructions`)
        .set(auth())
        .expect(201);

      const despues = await request.get(`/sales/${saleId}`).set(auth()).expect(200);
      expect(despues.body.notified.paymentInstructions).toBe(true);
    });

    it('un pedido de mostrador no se avisa: el cliente está en la caja', async () => {
      await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).catch(() => undefined);
      const counter = await request
        .post('/sales')
        .set(auth())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(201);
      const res = await request
        .post(`/sales/${counter.body.id}/whatsapp/payment_received`)
        .set(auth())
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('mostrador');
    });

    it('una etapa inventada se rechaza', async () => {
      const saleId = await conEnvio();
      await request.post(`/sales/${saleId}/whatsapp/te_amo`).set(auth()).expect(400);
    });

    it('una etapa que no corresponde al estado del pedido se rechaza (el flag no miente)', async () => {
      // Pedido SIN pagar: "avisar que el pago entró" sería falso. Antes el
      // server lo aceptaba y notified_payment_received quedaba en true sobre
      // una venta PENDIENTE_PAGO.
      const saleId = await conEnvio();
      const res = await request
        .post(`/sales/${saleId}/whatsapp/payment_received`)
        .set(auth())
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('estado');

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.notified_payment_received).toBe(false);
      expect(await prisma.whatsAppMessage.count({ where: { saleId } })).toBe(0);
    });

    it('doble tap concurrente: UN solo registro manual (claim atómico del flag)', async () => {
      const saleId = await conEnvio();
      // Dos requests simultáneas del mismo aviso (doble click / retry de red).
      const [a, b] = await Promise.all([
        request.post(`/sales/${saleId}/whatsapp/payment_instructions`).set(auth()),
        request.post(`/sales/${saleId}/whatsapp/payment_instructions`).set(auth()),
      ]);
      const statuses = [a.status, b.status].sort((x, y) => x - y);
      expect(statuses).toEqual([201, 400]);

      const msgs = await prisma.whatsAppMessage.findMany({ where: { saleId } });
      expect(msgs).toHaveLength(1);
      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.notified_payment_instructions).toBe(true);
    });
  });

  it('reenviar exige `force`: no se le manda dos veces por descuido', async () => {
    const created = await order({
      type: 'WEB_DELIVERY',
      deliveryAddress: DIRECCION,
      ...CERCA,
    }).expect(201);
    const saleId = created.body.order.id as string;
    await request.patch(`/sales/${saleId}/delivery-fee`).set(auth()).send({ fee: 7000 }).expect(200);

    await request.post(`/sales/${saleId}/whatsapp/payment_instructions`).set(auth()).expect(201);
    await request.post(`/sales/${saleId}/whatsapp/payment_instructions`).set(auth()).expect(400);

    const re = await request
      .post(`/sales/${saleId}/whatsapp/payment_instructions?force=true`)
      .set(auth())
      .expect(201);
    expect(re.body.alreadySent).toBe(true);

    const msgs = await prisma.whatsAppMessage.findMany({ where: { saleId } });
    expect(msgs).toHaveLength(2);
    expect(msgs.every((m) => m.status === 'manual')).toBe(true);
  });
});
