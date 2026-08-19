/**
 * E2E de COHERENCIA: lo que el dueño configura en el admin es exactamente lo
 * que la web ofrece y lo que el servidor permite. Tres capas que tienen que
 * decir lo mismo, siempre:
 *
 *   1. `PATCH /business-config`  — lo que guarda el admin
 *   2. `GET /web-hero/config`    — lo que la web lee para dibujarse
 *   3. `POST /web/orders`        — lo que el servidor deja pasar de verdad
 *
 * Existe porque el dueño reportó "hoy es lunes y deja pedir con el local
 * cerrado": no era un bug, el switch estaba apagado — pero nada garantizaba
 * que prenderlo funcionara para TODAS las combinaciones. Cada caso de acá
 * mueve una perilla y verifica las tres capas.
 *
 * Las suites vecinas cubren los mecanismos en profundidad (`web-business-config`
 * el horario, `web-address` el candado de zona); esta cubre que las perillas
 * gobiernen y no se pisen entre sí.
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

/** Días como los guarda `OpeningHours`. */
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const NOCHE = [{ start: '17:00', end: '23:00' }];

/**
 * Abierto 24 h de forma determinista: 00:00–23:59 deja afuera el último minuto
 * del día, así que un segundo rango que cruza medianoche lo tapa (mismo truco
 * que `web-business-config`).
 */
const TODO_EL_DIA = [
  { start: '00:00', end: '23:59' },
  { start: '23:30', end: '02:00' },
];

const semanal = (porDia: (d: (typeof DOW)[number]) => { start: string; end: string }[]) => ({
  weekly: Object.fromEntries(DOW.map((d) => [d, porDia(d)])) as Record<
    string,
    { start: string; end: string }[]
  >,
  overrides: [],
  restDayHolidayShift: false,
});

/** Saca el horario de la ecuación: siempre abierto. */
const siempreAbierto = () => semanal(() => TODO_EL_DIA);

/**
 * Semanal con HOY cerrado y el resto abierto de noche: reproduce el caso que
 * reportó el dueño (lunes cerrado) sin depender de qué día corran los tests.
 */
const hoyCerrado = () => {
  const today = DOW[new Date().getDay()]!;
  return semanal((d) => (d === today ? [] : NOCHE));
};

describe('Coherencia admin → web → servidor E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let productId: string;

  const auth = () => ({ Authorization: `Bearer ${duenoToken}` });
  const phone = () =>
    `+57303${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

  const setConfig = (patch: Record<string, unknown>) =>
    request.patch('/business-config').set(auth()).send(patch).expect(200);

  /** Lo que la WEB lee para dibujarse. */
  const publicConfig = async () =>
    (await request.get('/web-hero/config').expect(200)).body.business;

  const pedir = (body: Record<string, unknown>) =>
    request
      .post('/web/orders')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId, quantity: 1 }],
        customerName: 'Cliente Coherencia',
        customerPhone: phone(),
        ...body,
      });

  /** Dirección verificada por el server (stub en test) → sobre firmado. */
  const direccion = async (texto: string) => {
    const sug = await request
      .get(`/web/address/suggest?q=${encodeURIComponent(texto)}`)
      .expect(200);
    const res = await request
      .post('/web/address/resolve')
      .send({ suggestionId: sug.body.suggestions[0].id })
      .expect(201);
    return res.body as { addressToken: string; formatted: string; inRange: boolean };
  };

  beforeAll(async () => {
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
        email: 'dueno-coh@test.local',
        fullName: 'Dueño Coherencia',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-coh@test.local');

    await prisma.productCategory.upsert({
      where: { name: 'Bebidas' },
      update: {},
      create: { name: 'Bebidas' },
    });
    const prod = await request
      .post('/products')
      .set(auth())
      .send({
        name: 'Coca Coherencia',
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
  });

  beforeEach(async () => {
    // Punto de partida neutro: todo abierto y sin restricciones. Cada caso
    // prende SOLO la perilla que está probando.
    await setConfig({
      coords: LOCAL,
      hours: siempreAbierto(),
      ordersRespectSchedule: false,
      deliveryEnabled: true,
      ordersRespectRadius: false,
      orderRadiusKm: 10,
      webOrdersEnabled: true,
    });
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ================================================================
  describe('el horario', () => {
    it('con el día de HOY cerrado y el switch APAGADO, se puede pedir', async () => {
      await setConfig({ hours: hoyCerrado(), ordersRespectSchedule: false });

      const cfg = await publicConfig();
      expect(cfg.schedule.isOpenNow).toBe(false);
      // La web sabe que el local está cerrado PERO que igual toma pedidos.
      expect(cfg.acceptingOrders).toBe(true);

      await pedir({ type: 'WEB_PICKUP' }).expect(201);
    });

    /** El caso exacto que reportó el dueño, con la perilla en su lugar. */
    it('con el día de HOY cerrado y el switch PRENDIDO, se rechaza', async () => {
      await setConfig({ hours: hoyCerrado(), ordersRespectSchedule: true });

      const cfg = await publicConfig();
      expect(cfg.schedule.isOpenNow).toBe(false);
      expect(cfg.acceptingOrders).toBe(false);

      const res = await pedir({ type: 'WEB_PICKUP' }).expect(503);
      expect(res.body.message).toContain('cerrados');
    });

    it('el switch se refleja en la config pública para que la web no invente', async () => {
      await setConfig({ ordersRespectSchedule: true });
      expect((await publicConfig()).schedule.ordersRespectSchedule).toBe(true);
      await setConfig({ ordersRespectSchedule: false });
      expect((await publicConfig()).schedule.ordersRespectSchedule).toBe(false);
    });
  });

  // ================================================================
  describe('los domicilios', () => {
    it('apagados: la web no los ofrece y el servidor los rechaza', async () => {
      await setConfig({ deliveryEnabled: false });

      expect((await publicConfig()).radius.deliveryEnabled).toBe(false);

      const res = await pedir({
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Cra 43A #5-15, torre 2',
      }).expect(400);
      expect(res.body.message).toContain('no hacemos domicilios');
      // Y recoger sigue funcionando: apagar domicilios no cierra la tienda.
      await pedir({ type: 'WEB_PICKUP' }).expect(201);
    });

    it('prendidos: la web los ofrece y el servidor los acepta', async () => {
      await setConfig({ deliveryEnabled: true });
      expect((await publicConfig()).radius.deliveryEnabled).toBe(true);

      const addr = await direccion('Carrera 70');
      await pedir({
        type: 'WEB_DELIVERY',
        deliveryAddress: addr.formatted,
        addressToken: addr.addressToken,
      }).expect(201);
    });
  });

  // ================================================================
  describe('el radio', () => {
    it('el valor en km del admin es el que se aplica, no uno fijo', async () => {
      await setConfig({ orderRadiusKm: 10, ordersRespectRadius: true });
      expect((await publicConfig()).radius.radiusKm).toBe(10);

      // El stub pone esta dirección a ~0.5-1 km del local → entra con 10 km.
      const cerca = await direccion('Carrera 70');
      expect(cerca.inRange).toBe(true);
      await pedir({
        type: 'WEB_DELIVERY',
        deliveryAddress: cerca.formatted,
        addressToken: cerca.addressToken,
      }).expect(201);

      // Achicando el radio, LA MISMA dirección queda afuera. Esto es lo que
      // prueba que el número del admin gobierna de verdad.
      await setConfig({ orderRadiusKm: 0.1 });
      expect((await publicConfig()).radius.radiusKm).toBe(0.1);

      const mismaAhoraLejos = await direccion('Carrera 70');
      expect(mismaAhoraLejos.inRange).toBe(false);
      const res = await pedir({
        type: 'WEB_DELIVERY',
        deliveryAddress: mismaAhoraLejos.formatted,
        addressToken: mismaAhoraLejos.addressToken,
      }).expect(400);
      expect(res.body.message).toContain('km');
    });

    /**
     * Con el switch apagado el veredicto es `inRange: true` INCLUSO para una
     * dirección lejísimos: `checkRadius` corta antes de medir porque no hay
     * nada que hacer con la respuesta. Así la web no le muestra al cliente una
     * advertencia de "estás fuera de zona" que el servidor no va a aplicar.
     */
    it('apagado: ni siquiera se mide, y una dirección lejana entra', async () => {
      await setConfig({ ordersRespectRadius: false, orderRadiusKm: 3 });
      expect((await publicConfig()).radius.ordersRespectRadius).toBe(false);

      const lejos = await direccion('Calle lejos');
      expect(lejos.inRange).toBe(true);

      await pedir({
        type: 'WEB_DELIVERY',
        deliveryAddress: lejos.formatted,
        addressToken: lejos.addressToken,
      }).expect(201);
    });

    it('y prendido, la MISMA dirección pasa a estar fuera de zona', async () => {
      await setConfig({ ordersRespectRadius: true, orderRadiusKm: 3 });
      const lejos = await direccion('Calle lejos');
      expect(lejos.inRange).toBe(false);
      await pedir({
        type: 'WEB_DELIVERY',
        deliveryAddress: lejos.formatted,
        addressToken: lejos.addressToken,
      }).expect(400);
    });

    it('sin coordenadas del local no se bloquea a nadie: no hay contra qué medir', async () => {
      await setConfig({ coords: '', ordersRespectRadius: true, orderRadiusKm: 3 });

      const lejos = await direccion('Calle lejos');
      await pedir({
        type: 'WEB_DELIVERY',
        deliveryAddress: lejos.formatted,
        addressToken: lejos.addressToken,
      }).expect(201);
    });

    it('el radio NO aplica a quien viene a recoger', async () => {
      await setConfig({ ordersRespectRadius: true, orderRadiusKm: 0.1 });
      await pedir({ type: 'WEB_PICKUP' }).expect(201);
    });
  });

  // ================================================================
  describe('el interruptor general', () => {
    it('apagado, manda sobre todo lo demás', async () => {
      await setConfig({ webOrdersEnabled: false, hours: siempreAbierto() });

      const cfg = await publicConfig();
      expect(cfg.webOrdersEnabled).toBe(false);
      expect(cfg.acceptingOrders).toBe(false);

      // Ni recoger ni domicilio, aunque el horario diga que está abierto.
      const res = await pedir({ type: 'WEB_PICKUP' }).expect(503);
      expect(res.body.message).toContain('deshabilitados');
    });
  });

  // ================================================================
  describe('las perillas no se pisan entre sí', () => {
    it('horario cerrado + radio prendido: gana el horario (503, no 400)', async () => {
      await setConfig({
        hours: hoyCerrado(),
        ordersRespectSchedule: true,
        ordersRespectRadius: true,
        orderRadiusKm: 3,
      });
      // Un domicilio válido en zona igual se rechaza por horario: el gate de
      // "¿se toman pedidos?" corre ANTES que el de cobertura.
      const addr = await direccion('Carrera 70');
      await pedir({
        type: 'WEB_DELIVERY',
        deliveryAddress: addr.formatted,
        addressToken: addr.addressToken,
      }).expect(503);
    });

    it('todo prendido y todo en orden: el pedido entra', async () => {
      await setConfig({
        hours: siempreAbierto(),
        ordersRespectSchedule: true,
        deliveryEnabled: true,
        ordersRespectRadius: true,
        orderRadiusKm: 10,
        webOrdersEnabled: true,
      });
      const cfg = await publicConfig();
      expect(cfg.acceptingOrders).toBe(true);
      expect(cfg.radius.deliveryEnabled).toBe(true);

      const addr = await direccion('Carrera 70');
      await pedir({
        type: 'WEB_DELIVERY',
        deliveryAddress: addr.formatted,
        addressToken: addr.addressToken,
      }).expect(201);
    });
  });
});
