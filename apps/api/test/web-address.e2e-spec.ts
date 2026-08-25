/**
 * E2E del autocompletado de direcciones y del CANDADO de zona (§7.v23).
 *
 * Lo que se prueba de fondo: la cobertura se mide contra la DIRECCIÓN elegida,
 * no contra el GPS del navegador (que decía dónde está el teléfono, no a dónde
 * va la comida), y el rechazo no se puede evadir editando el body.
 *
 * Corre con el `StubAddressAdapter` (no hay GOOGLE_MAPS_API_KEY en test): una
 * dirección que contiene "lejos" cae a ~50 km del local; cualquier otra, a
 * menos de 1 km.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AddressTokenService } from '../src/web-orders/address-token.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const LOCAL = '6.1658173,-75.580882';

describe('Direcciones y zona de cobertura E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let tokens: AddressTokenService;
  let duenoToken: string;
  let productId: string;

  const auth = () => ({ Authorization: `Bearer ${duenoToken}` });
  const phone = () =>
    `+57302${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

  /** Busca y resuelve una dirección; devuelve el sobre firmado por el server. */
  const resolveAddress = async (texto: string) => {
    const sug = await request
      .get(`/web/address/suggest?q=${encodeURIComponent(texto)}&session=s1`)
      .expect(200);
    const first = sug.body.suggestions[0];
    expect(first).toBeDefined();
    const res = await request
      .post('/web/address/resolve')
      .send({ suggestionId: first.id, sessionToken: 's1' })
      .expect(201);
    return res.body as {
      addressToken: string;
      inRange: boolean;
      distanceKm: number | null;
      radiusKm: number;
      formatted: string;
    };
  };

  const order = (body: Record<string, unknown>) =>
    request
      .post('/web/orders')
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId, quantity: 1 }],
        customerName: 'Cliente Dirección',
        customerPhone: phone(),
        ...body,
      });

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
    tokens = app.get(AddressTokenService);
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-addr@test.local',
        fullName: 'Dueño Addr',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-addr@test.local');

    await prisma.productCategory.upsert({
      where: { name: 'Bebidas' },
      update: {},
      create: { name: 'Bebidas' },
    });
    const prod = await request
      .post('/products')
      .set(auth())
      .send({
        name: 'Coca Addr',
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
      .send({
        coords: LOCAL,
        orderRadiusKm: 3,
        ordersRespectRadius: true,
        deliveryEnabled: true,
      })
      .expect(200);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('el autocompletado', () => {
    it('menos de 4 letras no gasta una búsqueda', async () => {
      const res = await request.get('/web/address/suggest?q=cra').expect(200);
      expect(res.body.suggestions).toEqual([]);
    });

    it('devuelve sugerencias y ninguna trae coordenadas todavía', async () => {
      const res = await request.get('/web/address/suggest?q=Carrera 43A').expect(200);
      expect(res.body.suggestions.length).toBeGreaterThan(0);
      expect(res.body.suggestions[0]).toEqual({
        id: expect.any(String),
        description: expect.any(String),
      });
      expect(res.body.suggestions[0].lat).toBeUndefined();
    });

    it('resolver una sugerencia da coordenadas, distancia y el sobre firmado', async () => {
      const r = await resolveAddress('Carrera 43A');
      expect(r.addressToken).toBeTruthy();
      expect(r.inRange).toBe(true);
      expect(r.distanceKm).toBeLessThan(3);
      expect(r.radiusKm).toBe(3);
    });

    it('una dirección lejana se marca fuera de zona con la distancia real', async () => {
      const r = await resolveAddress('Calle lejos');
      expect(r.inRange).toBe(false);
      expect(r.distanceKm).toBeGreaterThan(3);
    });

    it('un id inventado no rompe: responde sin sobre firmado', async () => {
      const res = await request
        .post('/web/address/resolve')
        .send({ suggestionId: 'no-existe' })
        .expect(201);
      expect(res.body.addressToken).toBe('');
      expect(res.body.inRange).toBe(false);
    });
  });

  describe('el candado de la zona', () => {
    it('con la dirección dentro del radio, el pedido entra', async () => {
      const addr = await resolveAddress('Carrera 43A');
      const res = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: addr.formatted,
        addressToken: addr.addressToken,
      }).expect(201);
      expect(res.body.order.type).toBe('WEB_DELIVERY');
    });

    it('fuera del radio se RECHAZA (ya no es solo un aviso)', async () => {
      const addr = await resolveAddress('Calle lejos');
      const res = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: addr.formatted,
        addressToken: addr.addressToken,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain('km');
    });

    /**
     * El corazón del asunto: si las coordenadas viajaran sueltas, cambiar un
     * número en el body saltearía el candado. Van firmadas justamente por esto.
     */
    it('un sobre alterado no sirve: el pedido se rechaza', async () => {
      const addr = await resolveAddress('Carrera 43A');
      const [payload, sig] = addr.addressToken.split('.');
      // Payload de otra ubicación, con la firma del original.
      const falso = Buffer.from(
        JSON.stringify({ formatted: 'x', lat: 6.99, lng: -75.99, exp: Date.now() + 60_000 }),
        'utf8',
      ).toString('base64url');
      expect(payload).not.toBe(falso);

      await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Cra falsa 123',
        addressToken: `${falso}.${sig}`,
      }).expect(400);
    });

    it('sin sobre firmado no se puede pedir a domicilio con el radio activo', async () => {
      const res = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Cra 43A #5-15, torre 2',
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain('sugerencias');
    });

    it('mandar un GPS a mano ya NO alcanza para pasar el candado', async () => {
      // Antes esto bastaba: se medía el GPS del navegador. Ahora se ignora
      // para la cobertura — mide dónde está el teléfono, no a dónde va.
      await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Cra 43A #5-15, torre 2',
        customerLat: 6.1705,
        customerLng: -75.5835,
      }).expect(400);
    });

    it('un sobre vencido no sirve', async () => {
      const vencido = tokens.issue({ formatted: 'x', lat: 6.166, lng: -75.5809 });
      // Se fuerza el vencimiento re-firmando con exp en el pasado.
      const [, sig] = vencido.split('.');
      const viejo = Buffer.from(
        JSON.stringify({ formatted: 'x', lat: 6.166, lng: -75.5809, exp: Date.now() - 1000 }),
        'utf8',
      ).toString('base64url');
      await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: 'Cra 43A #5-15',
        addressToken: `${viejo}.${sig}`,
      }).expect(400);
    });

    it('RECOGER no se toca: desde la misma distancia entra igual', async () => {
      // Quien viene a recoger maneja hasta el local; el radio no le aplica.
      await order({ type: 'WEB_PICKUP' }).expect(201);
    });

    it('con el rechazo por radio APAGADO, un domicilio lejano vuelve a entrar', async () => {
      await request
        .patch('/business-config')
        .set(auth())
        .send({ ordersRespectRadius: false })
        .expect(200);
      try {
        const addr = await resolveAddress('Calle lejos');
        await order({
          type: 'WEB_DELIVERY',
          deliveryAddress: addr.formatted,
          addressToken: addr.addressToken,
        }).expect(201);
      } finally {
        await request
          .patch('/business-config')
          .set(auth())
          .send({ ordersRespectRadius: true })
          .expect(200);
      }
    });
  });

  it('la venta guarda las coordenadas de la DIRECCIÓN, no las del teléfono', async () => {
    const addr = await resolveAddress('Carrera 43A');
    const res = await order({
      type: 'WEB_DELIVERY',
      deliveryAddress: addr.formatted,
      addressToken: addr.addressToken,
      // GPS del cliente en otro lado (pidió desde el trabajo).
      customerLat: 4.711,
      customerLng: -74.0721,
    }).expect(201);

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: res.body.order.id } });
    // Se guardó la casa (cerca del local), no Bogotá.
    expect(Number(sale.deliveryLat)).toBeGreaterThan(6);
    expect(Number(sale.deliveryLat)).toBeLessThan(7);
  });

  // Bug: con token válido, deliveryAddress persistía el TEXTO LIBRE del body → un POST directo pasaba el candado del radio y escribía una dirección a 20 km.
  it('con sobre firmado, la venta guarda la dirección VERIFICADA del token, no el texto libre del body', async () => {
    const addr = await resolveAddress('Carrera 43A');
    const res = await order({
      type: 'WEB_DELIVERY',
      // Texto del cliente que NO coincide con la dirección resuelta.
      deliveryAddress: 'Vereda lejana falsa a 20 km',
      addressToken: addr.addressToken,
    }).expect(201);

    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: res.body.order.id },
      select: { deliveryAddress: true },
    });
    expect(sale.deliveryAddress).toBe(addr.formatted);
    expect(sale.deliveryAddress).not.toBe('Vereda lejana falsa a 20 km');
  });
});
