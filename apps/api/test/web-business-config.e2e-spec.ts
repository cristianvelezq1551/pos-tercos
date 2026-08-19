/**
 * E2E de la config de la web del cliente (2026-07-16): `GET /web-hero/config`
 * trae contacto + horarios + redes + "Nosotros" junto a la publicidad, y el
 * horario BLOQUEA de verdad los pedidos web cuando el dueño prende el switch.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { DEFAULT_OPENING_HOURS, type OpeningHours } from '@pos-tercos/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/** YYYY-MM-DD local (nunca toISOString: en Bogotá corre el día). */
const ymdLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const NIGHT = [{ start: '17:00', end: '23:00' }];

/** Todos los días con horario nocturno: nadie es día de descanso. */
const everyNight = (): OpeningHours => ({
  weekly: { sun: NIGHT, mon: NIGHT, tue: NIGHT, wed: NIGHT, thu: NIGHT, fri: NIGHT, sat: NIGHT },
  overrides: [],
  restDayHolidayShift: true,
});

/**
 * Abierto las 24 h de forma determinista: 00:00–23:59 deja afuera el último
 * minuto del día, así que el segundo rango (que cruza medianoche) lo tapa.
 */
const ALWAYS = [
  { start: '00:00', end: '23:59' },
  { start: '23:30', end: '02:00' },
];
const alwaysOpen = (): OpeningHours => ({
  weekly: { sun: ALWAYS, mon: ALWAYS, tue: ALWAYS, wed: ALWAYS, thu: ALWAYS, fri: ALWAYS, sat: ALWAYS },
  overrides: [],
  restDayHolidayShift: true,
});

const neverOpen = (): OpeningHours => ({
  weekly: { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] },
  overrides: [],
  restDayHolidayShift: false,
});

describe('Config de la web del cliente E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let adminToken: string;
  let productId: string;

  const auth = () => ({ Authorization: `Bearer ${duenoToken}` });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-web@test.local',
          fullName: 'Dueño Web',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'admin-web@test.local',
          fullName: 'Admin Web',
          role: 'ADMIN_OPERATIVO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
    });
    duenoToken = await loginAs(request, 'dueno-web@test.local');
    adminToken = await loginAs(request, 'admin-web@test.local');

    // `cleanDb` NO trunca product_categories (deuda documentada en CLAUDE.md
    // §7.v15) → upsert, o la suite se cae según lo que dejó la anterior.
    await prisma.productCategory.upsert({
      where: { name: 'Bebidas' },
      update: {},
      create: { name: 'Bebidas' },
    });
    const prod = await request
      .post('/products')
      .set(auth())
      .send({
        name: 'Coca Web',
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
      .send({ entityType: 'PRODUCT', productId, delta: 200, type: 'INITIAL', unitCost: 1500 })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const setConfig = (patch: Record<string, unknown>) =>
    request.patch('/business-config').set(auth()).send(patch).expect(200);

  const order = () =>
    request
      .post('/web/orders')
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'WEB_PICKUP',
        items: [{ productId, quantity: 1 }],
        customerName: 'Cliente Test',
        customerPhone: `+57300${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`,
      });

  describe('GET /web-hero/config', () => {
    it('es público y trae publicidad + negocio en una sola respuesta', async () => {
      const res = await request.get('/web-hero/config').expect(200);
      expect(res.body).toHaveProperty('slides');
      expect(res.body).toHaveProperty('business');
      expect(res.body.business).toHaveProperty('contact');
      expect(res.body.business).toHaveProperty('social');
      expect(res.body.business).toHaveProperty('about');
      expect(res.body.business).toHaveProperty('schedule');
      expect(res.body.business).toHaveProperty('acceptingOrders');
    });

    it('devuelve lo que el dueño configuró', async () => {
      await setConfig({
        phone: '+573207615261',
        phoneDisplay: '+57 320 761 5261',
        address: 'Cra 31 #37s-49, Envigado',
        instagramUrl: 'https://instagram.com/tercos',
        aboutHeadline: 'Nacimos tercos.',
        aboutStory: 'Una historia.',
        aboutValues: [{ title: 'Fuego Real', description: 'Con llama.' }],
      });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.contact.phone).toBe('+573207615261');
      expect(body.business.contact.phoneDisplay).toBe('+57 320 761 5261');
      expect(body.business.contact.address).toBe('Cra 31 #37s-49, Envigado');
      expect(body.business.social.instagram).toBe('https://instagram.com/tercos');
      expect(body.business.social.tiktok).toBeNull();
      expect(body.business.about.headline).toBe('Nacimos tercos.');
      expect(body.business.about.values).toEqual([
        { title: 'Fuego Real', description: 'Con llama.' },
      ]);
      expect(body.business.about.imageUrl).toBeNull();
    });

    it('con la fila recién creada cae al horario por defecto (lunes cerrado)', async () => {
      // La columna arranca en `{}`; sin fallback la web quedaría sin horario.
      await prisma.businessConfig.update({
        where: { id: 'singleton' },
        data: { hours: {} },
      });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.schedule.hours).toEqual(DEFAULT_OPENING_HOURS);
      expect(body.business.schedule.hours.weekly.mon).toEqual([]);
    });

    it('un horario corrupto NO tumba la web ni deja el local cerrado para siempre', async () => {
      await prisma.businessConfig.update({
        where: { id: 'singleton' },
        data: { hours: { weekly: 'basura', overrides: 42 } },
      });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.schedule.hours).toEqual(DEFAULT_OPENING_HOURS);
    });
  });

  describe('el horario bloquea los pedidos', () => {
    it('con el switch APAGADO se pide a cualquier hora, aunque esté cerrado', async () => {
      await setConfig({ hours: neverOpen(), ordersRespectSchedule: false });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.schedule.isOpenNow).toBe(false);
      expect(body.business.acceptingOrders).toBe(true);
      await order().expect(201);
    });

    it('con el switch PRENDIDO y cerrado, rechaza con 503 y dice cuándo abre', async () => {
      const today = ymdLocal(new Date());
      await setConfig({
        // Todos los días abren de noche, pero HOY hay una excepción cerrada →
        // determinista: corra a la hora que corra, la próxima es mañana 17:00.
        hours: { ...everyNight(), overrides: [{ date: today, closed: true, ranges: [] }] },
        ordersRespectSchedule: true,
      });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.schedule.isOpenNow).toBe(false);
      expect(body.business.acceptingOrders).toBe(false);

      const res = await order().expect(503);
      expect(res.body.message).toContain('Estamos cerrados');
      expect(res.body.message).toContain('Abrimos mañana');
    });

    it('con el switch PRENDIDO y abierto, deja pedir', async () => {
      await setConfig({ hours: alwaysOpen(), ordersRespectSchedule: true });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.schedule.isOpenNow).toBe(true);
      expect(body.business.acceptingOrders).toBe(true);
      await order().expect(201);
    });

    it('una excepción abre un día que el semanal tenía cerrado', async () => {
      const today = ymdLocal(new Date());
      await setConfig({
        hours: {
          ...neverOpen(),
          overrides: [{ date: today, closed: false, ranges: ALWAYS, note: 'Festivo, abrimos' }],
        },
        ordersRespectSchedule: true,
      });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.schedule.isOpenNow).toBe(true);
      await order().expect(201);
    });

    it('el kill-switch (#13) manda sobre el horario', async () => {
      await setConfig({ hours: alwaysOpen(), ordersRespectSchedule: true, webOrdersEnabled: false });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.schedule.isOpenNow).toBe(true);
      expect(body.business.acceptingOrders).toBe(false);

      const res = await order().expect(503);
      expect(res.body.message).toContain('deshabilitados');
      await setConfig({ webOrdersEnabled: true });
    });

    it('sin horario cargado y con el switch prendido, avisa sin inventar hora', async () => {
      await setConfig({ hours: neverOpen(), ordersRespectSchedule: true });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.schedule.nextOpenAt).toBeNull();
      const res = await order().expect(503);
      expect(res.body.message).toBe('Estamos cerrados en este momento.');
    });
  });

  describe('zona de cobertura', () => {
    // Local en Envigado; el cliente "cerca" a ~1 km y "lejos" en Bogotá (~240 km).
    const LOCAL = '6.1658173,-75.580882';
    const CERCA = { customerLat: 6.1705, customerLng: -75.5835 };
    const LEJOS = { customerLat: 4.711, customerLng: -74.0721 };

    /**
     * §7.v23: la cobertura se mide contra la DIRECCIÓN elegida, no contra el
     * GPS. `orderFrom` sigue mandando coordenadas de navegador a propósito —
     * lo que prueba ahora es que ese camino YA NO alcanza para pasar el
     * candado. El flujo bueno (sugerencia → sobre firmado) vive en
     * `web-address.e2e-spec.ts`, junto al resto del candado.
     */
    const orderFrom = (coords?: { customerLat: number; customerLng: number }) =>
      request
        .post('/web/orders')
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'WEB_DELIVERY',
          deliveryAddress: 'Cra 43A #5-15, torre 2, apto 502',
          items: [{ productId, quantity: 1 }],
          customerName: 'Cliente Radio',
          customerPhone: `+57301${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`,
          ...coords,
        });

    beforeAll(async () => {
      await setConfig({
        hours: alwaysOpen(),
        ordersRespectSchedule: false,
        webOrdersEnabled: true,
        // Los casos de acá piden a DOMICILIO (el radio es su zona de cobertura).
        deliveryEnabled: true,
      });
    });

    it('lo expone en la config pública', async () => {
      await setConfig({ coords: LOCAL, orderRadiusKm: 10, ordersRespectRadius: true });
      const { body } = await request.get('/web-hero/config').expect(200);
      expect(body.business.radius).toEqual({
        deliveryEnabled: true,
        radiusKm: 10,
        ordersRespectRadius: true,
        originCoords: LOCAL,
      });
    });

    it('con el switch APAGADO no se le pide dirección verificada a nadie', async () => {
      await setConfig({ coords: LOCAL, orderRadiusKm: 10, ordersRespectRadius: false });
      await orderFrom(LEJOS).expect(201);
    });

    /**
     * El GPS decía dónde está el TELÉFONO, no a dónde va la comida: quien pedía
     * desde el trabajo para su casa se medía desde el trabajo. Desde §7.v23 no
     * participa de la decisión, ni para dejar pasar ni para rechazar.
     */
    it('con el switch PRENDIDO, el GPS del navegador ya no habilita el pedido', async () => {
      await setConfig({ coords: LOCAL, orderRadiusKm: 10, ordersRespectRadius: true });
      const res = await orderFrom(CERCA).expect(400);
      expect(res.body.message).toContain('sugerencias');
    });

    it('tampoco alcanza con NO mandar ubicación', async () => {
      await setConfig({ coords: LOCAL, orderRadiusKm: 10, ordersRespectRadius: true });
      await orderFrom().expect(400);
    });

    it('rechaza latitud sin longitud', async () => {
      await request
        .post('/web/orders')
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'WEB_PICKUP',
          items: [{ productId, quantity: 1 }],
          customerName: 'Cliente',
          customerPhone: '+573001112233',
          customerLat: 6.17,
        })
        .expect(400);
    });

    it('rechaza un radio absurdo o cero', async () => {
      await request.patch('/business-config').set(auth()).send({ orderRadiusKm: 0 }).expect(400);
      await request.patch('/business-config').set(auth()).send({ orderRadiusKm: 500 }).expect(400);
    });

    afterAll(async () => {
      await setConfig({ ordersRespectRadius: false, coords: LOCAL, orderRadiusKm: 10 });
    });
  });

  describe('PATCH /business-config', () => {
    it('deduce las coordenadas de un link largo de Maps sin salir a la red', async () => {
      await setConfig({
        mapsUrl: 'https://www.google.com/maps/place/TERCOS/@6.1658173,-75.5834623,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d6.1658173!4d-75.580882',
      });
      const { body } = await request.get('/web-hero/config').expect(200);
      // Gana el pin del place (!3d/!4d), no el centro del mapa (@).
      expect(body.business.contact.coords).toBe('6.1658173,-75.580882');
    });

    it('rechaza un teléfono que no es colombiano E.164', async () => {
      await request.patch('/business-config').set(auth()).send({ phone: '3207615261' }).expect(400);
      await request.patch('/business-config').set(auth()).send({ phone: '+1555' }).expect(400);
    });

    it('rechaza horarios con formato inválido', async () => {
      await request
        .patch('/business-config')
        .set(auth())
        .send({ hours: { ...everyNight(), weekly: { ...everyNight().weekly, tue: [{ start: '25:00', end: '23:00' }] } } })
        .expect(400);
    });

    it('rechaza dos excepciones para la misma fecha', async () => {
      await request
        .patch('/business-config')
        .set(auth())
        .send({
          hours: {
            ...everyNight(),
            overrides: [
              { date: '2026-12-25', closed: true, ranges: [] },
              { date: '2026-12-25', closed: false, ranges: NIGHT },
            ],
          },
        })
        .expect(400);
    });

    it('solo el dueño la edita: el admin operativo no', async () => {
      await request
        .patch('/business-config')
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({ address: 'Otra dirección' })
        .expect(403);
      // ...pero sí puede leerla (la usa el tablero).
      await request.get('/business-config').set({ Authorization: `Bearer ${adminToken}` }).expect(200);
    });

    it('el público no puede leer la config de admin', async () => {
      await request.get('/business-config').expect(401);
    });
  });
});
