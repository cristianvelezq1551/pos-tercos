/**
 * E2E de pedidos a DOMICILIO (2026-07-16). Vuelve `WEB_DELIVERY`, que la
 * reorientación v2 había eliminado. Cubre: la dirección es obligatoria y solo
 * existe en domicilios, el radio aplica SOLO a domicilios (a quien viene a
 * recoger no se le bloquea por vivir lejos) y el WhatsApp de "listo" cambia.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const LOCAL = '6.1658173,-75.580882';
const CERCA = { customerLat: 6.1705, customerLng: -75.5835 }; // ~0.6 km
const LEJOS = { customerLat: 4.711, customerLng: -74.0721 }; // Bogotá, ~232 km
const DIRECCION = 'Cra 43A #5-15, torre 2, apto 502';

describe('Pedidos a domicilio E2E', () => {
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
        customerName: 'Cliente Domicilio',
        customerPhone: phone(),
        ...body,
      });

  const setConfig = (patch: Record<string, unknown>) =>
    request.patch('/business-config').set(auth()).send(patch).expect(200);

  /**
   * `notify()` es fire-and-forget (un fallo de WhatsApp nunca revierte la
   * transición), así que la fila aparece DESPUÉS de que el endpoint respondió.
   */
  const waitForMessage = async (saleId: string, stage: string) => {
    for (let i = 0; i < 50; i++) {
      const msg = await prisma.whatsAppMessage.findFirst({ where: { saleId, stage } });
      if (msg) return msg;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`No llegó el mensaje "${stage}" de la venta ${saleId}`);
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-delivery@test.local',
        fullName: 'Dueño Delivery',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-delivery@test.local');

    await prisma.productCategory.upsert({
      where: { name: 'Bebidas' },
      update: {},
      create: { name: 'Bebidas' },
    });
    const prod = await request
      .post('/products')
      .set(auth())
      .send({
        name: 'Coca Delivery',
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

    await setConfig({
      coords: LOCAL,
      orderRadiusKm: 10,
      ordersRespectRadius: true,
      deliveryEnabled: true,
    });
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('la dirección', () => {
    it('un domicilio SIN dirección se rechaza', async () => {
      const res = await order({ type: 'WEB_DELIVERY', ...CERCA }).expect(400);
      expect(JSON.stringify(res.body)).toContain('dirección');
    });

    it('un pedido para recoger NO puede llevar dirección', async () => {
      await order({ type: 'WEB_PICKUP', deliveryAddress: DIRECCION }).expect(400);
    });

    it('una dirección de dos letras no es una dirección', async () => {
      await order({ type: 'WEB_DELIVERY', deliveryAddress: 'ahí', ...CERCA }).expect(400);
    });

    it('un domicilio válido se crea y guarda la dirección', async () => {
      const res = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: DIRECCION,
        deliveryNotes: 'El timbre no suena, llamar',
        ...CERCA,
      }).expect(201);

      // El create responde { order, token, ... }, no el pedido pelado.
      expect(res.body.order.type).toBe('WEB_DELIVERY');
      expect(res.body.order.deliveryAddress).toBe(DIRECCION);
      expect(res.body.order.deliveryNotes).toBe('El timbre no suena, llamar');

      // El GPS queda guardado con la venta (para abrir el mapa desde el POS),
      // pero la dirección escrita es la que manda.
      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: res.body.order.id } });
      expect(Number(sale.deliveryLat)).toBeCloseTo(CERCA.customerLat, 4);
      expect(Number(sale.deliveryLng)).toBeCloseTo(CERCA.customerLng, 4);
    });

    it('en un pedido para recoger la dirección queda null', async () => {
      const res = await order({ type: 'WEB_PICKUP' }).expect(201);
      expect(res.body.order.deliveryAddress).toBeNull();
      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: res.body.order.id } });
      expect(sale.deliveryAddress).toBeNull();
      expect(sale.deliveryLat).toBeNull();
    });

    it('la DB rechaza un domicilio sin dirección aunque se saltee la app', async () => {
      // El CHECK es la última línea: defensa en profundidad sobre el Zod.
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO sales (id, receipt_number, type, status, subtotal, discount_total, total, created_at)
           VALUES (gen_random_uuid(), 999999, 'WEB_DELIVERY', 'PENDIENTE_PAGO', 100, 0, 100, now())`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('el switch de domicilios', () => {
    afterEach(async () => {
      await setConfig({ deliveryEnabled: true });
    });

    it('apagado, rechaza el domicilio aunque el POST venga directo al endpoint', async () => {
      await setConfig({ deliveryEnabled: false });
      const res = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: DIRECCION,
        ...CERCA,
      }).expect(400);
      expect(res.body.message).toContain('no hacemos domicilios');
    });

    it('apagado, RECOGER sigue funcionando', async () => {
      await setConfig({ deliveryEnabled: false });
      await order({ type: 'WEB_PICKUP' }).expect(201);
    });

    it('la config pública dice si se reparte', async () => {
      await setConfig({ deliveryEnabled: false });
      const off = await request.get('/web-hero/config').expect(200);
      expect(off.body.business.radius.deliveryEnabled).toBe(false);
      await setConfig({ deliveryEnabled: true });
      const on = await request.get('/web-hero/config').expect(200);
      expect(on.body.business.radius.deliveryEnabled).toBe(true);
    });
  });

  describe('la zona de cobertura aplica SOLO a domicilios', () => {
    it('un domicilio fuera del radio se rechaza', async () => {
      const res = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Calle 100 #15-20, Bogotá',
        ...LEJOS,
      }).expect(400);
      expect(res.body.message).toContain('fuera de nuestra zona de cobertura');
    });

    it('RECOGER desde la misma distancia se acepta: maneja hasta el local', async () => {
      await order({ type: 'WEB_PICKUP', ...LEJOS }).expect(201);
    });

    it('un domicilio dentro del radio se acepta', async () => {
      await order({ type: 'WEB_DELIVERY', deliveryAddress: DIRECCION, ...CERCA }).expect(201);
    });

    it('un domicilio SIN GPS se acepta: el permiso se puede negar', async () => {
      await order({ type: 'WEB_DELIVERY', deliveryAddress: DIRECCION }).expect(201);
    });
  });

  describe('el WhatsApp de "listo"', () => {
    it('a un domicilio le dice que va en camino, no que lo retire', async () => {
      const created = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: DIRECCION,
        ...CERCA,
      }).expect(201);

      await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).catch(() => undefined);
      await request
        .post(`/sales/${created.body.order.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 5000 })
        .expect(201);
      await request.post(`/sales/${created.body.order.id}/mark-ready`).set(auth()).expect(201);

      const msg = await waitForMessage(created.body.order.id, 'pickup_ready');
      expect(msg.body).toContain('va en camino');
      expect(msg.body).toContain(DIRECCION);
      expect(msg.body).not.toContain('listo para retirar');
    });

    it('a uno para recoger le sigue diciendo que lo retire', async () => {
      const created = await order({ type: 'WEB_PICKUP' }).expect(201);
      await request
        .post(`/sales/${created.body.order.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 5000 })
        .expect(201);
      await request.post(`/sales/${created.body.order.id}/mark-ready`).set(auth()).expect(201);

      const msg = await waitForMessage(created.body.order.id, 'pickup_ready');
      expect(msg.body).toContain('listo para retirar');
      expect(msg.body).not.toContain('va en camino');
    });
  });
});
