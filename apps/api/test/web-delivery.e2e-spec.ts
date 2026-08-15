/**
 * E2E de pedidos a DOMICILIO (2026-07-16). Vuelve `WEB_DELIVERY`, que la
 * reorientación v2 había eliminado. Cubre el CICLO del domicilio: la dirección
 * es obligatoria y solo existe en domicilios, el envío se cotiza antes de
 * cobrar, el WhatsApp de "listo" dice "va en camino", y el reparto cierra en
 * ENTREGADO.
 *
 * La zona de cobertura NO se prueba acá (vive en `web-address.e2e-spec.ts`):
 * desde §7.v23 se mide contra la dirección elegida, no contra el GPS.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { withDeliveringWhatsApp } from './helpers/whatsapp-provider';

const LOCAL = '6.1658173,-75.580882';
const CERCA = { customerLat: 6.1705, customerLng: -75.5835 }; // ~0.6 km
const DIRECCION = 'Cra 43A #5-15, torre 2, apto 502';

/** Hoy en YYYY-MM-DD local (nunca toISOString: en Bogotá corre el día). */
const ymdLocalToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
    // El throttle de `POST /web/orders` es 30/60s POR IP y esta suite dispara
    // ~35 pedidos desde 127.0.0.1 en pocos segundos: sin neutralizarlo, los
    // últimos tests fallan con 429 por vecindad y no por lo que prueban.
    //
    // Se reemplaza el STORAGE, no el guard: `ThrottlerGuard` está montado como
    // APP_GUARD (donde `overrideGuard` no llega) y pisar el token APP_GUARD se
    // llevaría puestos los guards de auth y roles. Con el contador siempre en 1
    // el guard corre de verdad pero nunca acumula.
    //
    // No se pierde cobertura del anti-abuso: el tope diario por IP se prueba
    // aislado en `src/web-orders/web-order-daily-limit.guard.spec.ts`.
    //
    // Además se inyecta un WhatsApp que SÍ entrega: esta suite prueba el camino
    // AUTOMÁTICO (el que corre en prod con Kapso). Que sin proveedor NO se envíe
    // ni se finja se prueba aparte, en `whatsapp-manual.e2e-spec.ts`.
    ({ app, prisma, request } = await bootstrapApp((b) =>
      withDeliveringWhatsApp(b).overrideProvider(ThrottlerStorage).useValue({
        // Forma de `ThrottlerStorageRecord` (el tipo no se exporta desde la raíz).
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 60,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      }),
    ));
    // Auto-aislada: no confiar en que la suite anterior limpió. Esta suite lee
    // agregados GLOBALES (reportes / ledger de inventario), así que un residuo
    // de otra suite mueve los números y el fallo depende del orden de archivos.
    await cleanDb(prisma);
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

    // El rechazo por radio queda APAGADO: esta suite prueba el ciclo del
    // domicilio (dirección, envío, despacho), no la cobertura. Con el candado
    // activo cada pedido necesitaría resolver una dirección primero, lo que
    // acoplaría estos tests al proveedor de direcciones sin agregar señal.
    // El candado se prueba entero en `web-address.e2e-spec.ts`.
    await setConfig({
      coords: LOCAL,
      orderRadiusKm: 10,
      ordersRespectRadius: false,
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

  /**
   * La zona de cobertura vivía acá midiendo el GPS del navegador. Desde §7.v23
   * se mide contra la DIRECCIÓN elegida y se prueba entera —incluida la parte
   * de que a quien viene a RECOGER no se le aplica— en `web-address.e2e-spec.ts`.
   */

  describe('el costo del envío', () => {
    const crearDom = () =>
      order({ type: 'WEB_DELIVERY', deliveryAddress: DIRECCION, ...CERCA }).expect(201);

    it('el pedido nace SIN envío: el total es solo la comida', async () => {
      const { body } = await crearDom();
      expect(body.order.total).toBe(5000);
      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: body.order.id } });
      expect(Number(sale.deliveryFee)).toBe(0);
    });

    it('NO le manda instrucciones de pago al crearlo: el total todavía no es real', async () => {
      const { body } = await crearDom();
      // §4.1: assertar el ESTADO, no el timing. El flag `notified_payment_instructions`
      // queda en false al crear un domicilio (a diferencia del pickup, que lo prende
      // al instante); antes un sleep(800) probaba la ausencia por carrera → falso
      // verde si el dispatch fire-and-forget tardaba > 800ms en CI.
      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: body.order.id } });
      expect(sale.notified_payment_instructions).toBe(false);
      // Y no hay ninguna fila del stage todavía.
      const msg = await prisma.whatsAppMessage.findFirst({
        where: { saleId: body.order.id, stage: 'payment_instructions' },
      });
      expect(msg).toBeNull();
    });

    it('el cajero asigna el envío → el total lo suma y SALE el WhatsApp', async () => {
      const { body } = await crearDom();
      const res = await request
        .patch(`/sales/${body.order.id}/delivery-fee`)
        .set(auth())
        .send({ fee: 6000 })
        .expect(200);

      expect(res.body.deliveryFee).toBe(6000);
      expect(res.body.total).toBe(11000); // 5000 comida + 6000 envío
      expect(res.body.subtotal).toBe(5000); // el subtotal NO se toca

      const msg = await waitForMessage(body.order.id, 'payment_instructions');
      expect(msg.body).toContain('11.000'); // el total REAL, no el de la comida
    });

    it('y el cobro valida contra ese total, no contra el de la comida', async () => {
      const { body } = await crearDom();
      await request.patch(`/sales/${body.order.id}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);
      await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).catch(() => undefined);

      // Pagar solo la comida ya no alcanza.
      await request
        .post(`/sales/${body.order.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 5000 })
        .expect(400);

      await request
        .post(`/sales/${body.order.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 11000 })
        .expect(201);
    });

    /**
     * Decisión del dueño 2026-07-27 (REVIERTE la de 2026-07-17): el envío NO es
     * ingreso. Esa plata es del domiciliario y solo pasa por la caja; contarla
     * inflaba ventas, ticket promedio y margen con dinero que no se queda.
     */
    it('el envío NO cuenta como ingreso: es plata del repartidor', async () => {
      const hoy = ymdLocalToday();
      const totalesDe = async (): Promise<{ revenue: number; deliveryCollected: number }> =>
        (await request.get(`/reports/sales-summary?from=${hoy}&to=${hoy}`).set(auth()).expect(200))
          .body.totals;
      // Delta, no valor absoluto: otros tests de la suite ya cobraron ventas.
      const antes = await totalesDe();

      const { body } = await crearDom();
      await request.patch(`/sales/${body.order.id}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);
      await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).catch(() => undefined);
      await request
        .post(`/sales/${body.order.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 11000 })
        .expect(201);

      const despues = await totalesDe();
      // El cliente pagó 11.000: 5.000 de comida (ingreso) + 6.000 de envío (de
      // un tercero, visible pero fuera de los ingresos).
      expect(despues.revenue - antes.revenue).toBe(5000);
      expect(despues.deliveryCollected - antes.deliveryCollected).toBe(6000);
    });

    /**
     * §7.v29: el reporte de VENTAS es neto de punta a punta. `byMethod` también
     * descuenta el envío (prorrateado), así que "por método" cuadra exacto con
     * "Ingresos" y no hace falta explicar ninguna diferencia. Lo cobrado en
     * bruto vive donde se necesita para conciliar: arqueo digital y el
     * matcheo contra el extracto.
     */
    it('por método también va neto: cuadra exacto con los ingresos', async () => {
      const hoy = ymdLocalToday();
      const resumen = async () =>
        (await request.get(`/reports/sales-summary?from=${hoy}&to=${hoy}`).set(auth()).expect(200))
          .body;

      const { body } = await crearDom();
      await request.patch(`/sales/${body.order.id}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);
      await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).catch(() => undefined);
      await request
        .post(`/sales/${body.order.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 11000 })
        .expect(201);

      const r = await resumen();
      const porMetodo = r.byMethod.reduce(
        (a: number, m: { revenue: number }) => a + m.revenue,
        0,
      );
      expect(porMetodo).toBeCloseTo(r.totals.revenue, 2);
      // Y el envío sigue reportado aparte, sin sumarse a nada.
      expect(r.totals.deliveryCollected).toBeGreaterThan(0);
    });

    it('un pedido para recoger no puede llevar envío', async () => {
      const { body } = await order({ type: 'WEB_PICKUP' }).expect(201);
      await request
        .patch(`/sales/${body.order.id}/delivery-fee`)
        .set(auth())
        .send({ fee: 6000 })
        .expect(400);
    });

    it('ya cobrado, el envío no se toca', async () => {
      const { body } = await crearDom();
      await request.patch(`/sales/${body.order.id}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);
      await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).catch(() => undefined);
      await request
        .post(`/sales/${body.order.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 11000 })
        .expect(201);
      await request
        .patch(`/sales/${body.order.id}/delivery-fee`)
        .set(auth())
        .send({ fee: 9000 })
        .expect(400);
    });

    it('rechaza un envío negativo, cero o absurdo', async () => {
      const { body } = await crearDom();
      await request.patch(`/sales/${body.order.id}/delivery-fee`).set(auth()).send({ fee: -1 }).expect(400);
      // §1.4: fee=0 ya NO es válido (un domicilio tiene costo; "gratis" va como descuento).
      await request.patch(`/sales/${body.order.id}/delivery-fee`).set(auth()).send({ fee: 0 }).expect(400);
      await request.patch(`/sales/${body.order.id}/delivery-fee`).set(auth()).send({ fee: 999999 }).expect(400);
    });

    // §1.4: cobrar un domicilio SIN cotizar el envío deja el envío incobrable → se bloquea.
    it('no se puede cobrar un domicilio sin el envío asignado', async () => {
      const { body } = await crearDom();
      await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).catch(() => undefined);
      const res = await request
        .post(`/sales/${body.order.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 5000 })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('envío');
    });

    // §0.2: editar un domicilio con envío asignado NO debe perder el envío del
    // total (el recálculo omitía deliveryFee → violaba el CHECK → 500 en loop).
    it('editar los ítems preserva el envío en el total (no revienta con 500)', async () => {
      const { body } = await crearDom();
      await request.patch(`/sales/${body.order.id}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);

      // Sube a 2 unidades: subtotal 10.000 + envío 6.000 = 16.000.
      const edited = await request
        .patch(`/sales/${body.order.id}/items`)
        .set(auth())
        .send({ items: [{ productId, quantity: 2 }] })
        .expect(200);

      expect(edited.body.subtotal).toBe(10000);
      expect(edited.body.deliveryFee).toBe(6000);
      expect(edited.body.total).toBe(16000);
    });

    // §0.3: corregir la tarifa debe REENVIAR el WhatsApp (antes el flag
    // idempotente lo bloqueaba y el cliente se quedaba con el total viejo).
    it('cambiar el envío reenvía las instrucciones con el total nuevo', async () => {
      const { body } = await crearDom();
      const saleId = body.order.id as string;

      await request.patch(`/sales/${saleId}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);
      await waitForMessage(saleId, 'payment_instructions'); // 1er envío ($11.000)

      // Corrección de tarifa: 6.000 → 9.000 (total 14.000).
      const res = await request
        .patch(`/sales/${saleId}/delivery-fee`)
        .set(auth())
        .send({ fee: 9000 })
        .expect(200);
      expect(res.body.total).toBe(14000);

      // Debe existir un SEGUNDO mensaje con el total nuevo.
      let second: { body: string } | null = null;
      for (let i = 0; i < 50; i++) {
        const msgs = await prisma.whatsAppMessage.findMany({
          where: { saleId, stage: 'payment_instructions' },
        });
        second = msgs.find((m) => m.body.includes('14.000')) ?? null;
        if (msgs.length >= 2 && second) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(second).not.toBeNull();
    });

    // §0.3 (contraparte): reasignar el MISMO envío no debe duplicar el WhatsApp.
    it('reasignar el mismo envío NO reenvía (idempotente)', async () => {
      const { body } = await crearDom();
      const saleId = body.order.id as string;
      await request.patch(`/sales/${saleId}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);
      await waitForMessage(saleId, 'payment_instructions');
      await request.patch(`/sales/${saleId}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);
      await new Promise((r) => setTimeout(r, 500));
      const msgs = await prisma.whatsAppMessage.findMany({
        where: { saleId, stage: 'payment_instructions' },
      });
      expect(msgs).toHaveLength(1);
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
      await request.patch(`/sales/${created.body.order.id}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);
      await request
        .post(`/sales/${created.body.order.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 11000 })
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

  /**
   * El texto de la PANTALLA de pago (no el WhatsApp): el cliente lo lee justo
   * antes de transferir. Decirle "pasa a retirar" a quien pidió a domicilio es
   * información falsa en el peor momento.
   */
  describe('las instrucciones de pago en pantalla', () => {
    it('a un domicilio no le dicen que lo retire', async () => {
      const created = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: DIRECCION,
        ...CERCA,
      }).expect(201);
      const saleId = created.body.order.id as string;
      await request.patch(`/sales/${saleId}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);

      const token = created.body.token as string;
      const res = await request.get(`/web/orders/${saleId}?token=${encodeURIComponent(token)}`).expect(200);
      expect(res.body.paymentInstructions).toContain('hacia tu dirección');
      expect(res.body.paymentInstructions).not.toContain('retirar');
    });

    it('a uno para recoger sí', async () => {
      const created = await order({ type: 'WEB_PICKUP' }).expect(201);
      expect(created.body.paymentInstructions).toContain('retirar');
      expect(created.body.paymentInstructions).not.toContain('hacia tu dirección');
    });
  });

  /**
   * §7.v30 — El domicilio se le paga al repartidor EN EL MOMENTO, siempre: no
   * existe un cierre con domicilios pendientes. Por eso el arqueo NUNCA espera
   * esa plata: al cerrar ya salió, y esperarla marcaría un sobrante inventado.
   */
  describe('el envío nunca entra al arqueo', () => {
    const cobrarDomicilio = async (metodo: string): Promise<string> => {
      const created = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: DIRECCION,
        ...CERCA,
      }).expect(201);
      const saleId = created.body.order.id as string;
      await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).catch(() => undefined);
      await request.patch(`/sales/${saleId}/delivery-fee`).set(auth()).send({ fee: 7000 }).expect(200);
      await request
        .post(`/sales/${saleId}/confirm-payment`)
        .set(auth())
        .send({
          method: metodo,
          amountReceived: 12000,
          ...(metodo === 'CASH' ? {} : { digitalDoubleVerified: true }),
        })
        .expect(201);
      return saleId;
    };

    const shiftId = async (): Promise<string> =>
      ((await request.get('/shifts/current').set(auth()).expect(200)).body as { id: string }).id;

    it('cobrado en EFECTIVO: el cajón solo espera la comida', async () => {
      const id = await shiftId().catch(async () => {
        await request.post('/shifts/open').set(auth()).send({ openingCash: 0 });
        return shiftId();
      });
      const esperado = async (): Promise<number> =>
        (
          (await request.get(`/shifts/${id}/expected-cash`).set(auth()).expect(200))
            .body as { expectedCash: number }
        ).expectedCash;

      const antes = await esperado();
      await cobrarDomicilio('CASH');
      // Pagó 12.000; solo los 5.000 de comida quedan en el cajón.
      expect((await esperado()) - antes).toBe(5000);
    });

    it('cobrado por TRANSFERENCIA: la cuenta tampoco espera el envío', async () => {
      const id = await shiftId();
      const esperadoTransfer = async (): Promise<number> => {
        const body = (
          await request.get(`/shifts/${id}/expected-cash`).set(auth()).expect(200)
        ).body as { digital: { method: string; expected: number }[] };
        return body.digital.find((d) => d.method === 'TRANSFER')?.expected ?? 0;
      };

      const antes = await esperadoTransfer();
      await cobrarDomicilio('TRANSFER');
      expect((await esperadoTransfer()) - antes).toBe(5000);
    });
  });

  /**
   * Cerrar el ciclo del reparto. Sin ENTREGADO, "va en la moto" y "el cliente
   * ya comió" son el mismo estado para siempre y el tiempo de entrega no existe.
   */
  describe('marcar entregado', () => {
    const despachado = async (): Promise<string> => {
      const created = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: DIRECCION,
        ...CERCA,
      }).expect(201);
      const saleId = created.body.order.id as string;
      await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).catch(() => undefined);
      await request.patch(`/sales/${saleId}/delivery-fee`).set(auth()).send({ fee: 6000 }).expect(200);
      await request
        .post(`/sales/${saleId}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 11000 })
        .expect(201);
      await request.post(`/sales/${saleId}/mark-ready`).set(auth()).expect(201);
      return saleId;
    };

    it('un domicilio despachado se marca entregado y queda en la bitácora', async () => {
      const saleId = await despachado();
      const res = await request.post(`/sales/${saleId}/mark-delivered`).set(auth()).expect(201);
      expect(res.body.status).toBe('ENTREGADO');

      const log = await prisma.saleStatusLog.findFirst({
        where: { saleId, statusTo: 'ENTREGADO' },
      });
      expect(log?.statusFrom).toBe('LISTO_DESPACHO');
    });

    it('no le manda otro WhatsApp: el cliente ya tiene la comida', async () => {
      const saleId = await despachado();
      // Esperar a que aterrice el `pickup_ready` ANTES de fotografiar el conteo:
      // notify() es fire-and-forget, así que contar de inmediato tomaba una foto
      // incompleta y el mensaje en vuelo se veía después como uno "nuevo".
      await waitForMessage(saleId, 'pickup_ready');
      const antes = await prisma.whatsAppMessage.count({ where: { saleId } });

      await request.post(`/sales/${saleId}/mark-delivered`).set(auth()).expect(201);
      await new Promise((r) => setTimeout(r, 400));
      expect(await prisma.whatsAppMessage.count({ where: { saleId } })).toBe(antes);
    });

    it('dos veces no vuelve a transicionar (guard por status)', async () => {
      const saleId = await despachado();
      await request.post(`/sales/${saleId}/mark-delivered`).set(auth()).expect(201);
      await request.post(`/sales/${saleId}/mark-delivered`).set(auth()).expect(400);
      const logs = await prisma.saleStatusLog.count({
        where: { saleId, statusTo: 'ENTREGADO' },
      });
      expect(logs).toBe(1);
    });

    it('un pedido que todavía no se despachó no se puede entregar', async () => {
      const created = await order({
        type: 'WEB_DELIVERY',
        deliveryAddress: DIRECCION,
        ...CERCA,
      }).expect(201);
      const res = await request
        .post(`/sales/${created.body.order.id}/mark-delivered`)
        .set(auth())
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('despacharlo');
    });

    it('un pedido para RECOGER no se marca entregado: termina en listo', async () => {
      const created = await order({ type: 'WEB_PICKUP' }).expect(201);
      const saleId = created.body.order.id as string;
      await request
        .post(`/sales/${saleId}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 5000 })
        .expect(201);
      await request.post(`/sales/${saleId}/mark-ready`).set(auth()).expect(201);

      const res = await request.post(`/sales/${saleId}/mark-delivered`).set(auth()).expect(400);
      expect(JSON.stringify(res.body)).toContain('domicilio');
    });

    it('entregado sigue contando como venta cobrada en el reporte', async () => {
      const hoy = ymdLocalToday();
      const revenueDe = async (): Promise<number> =>
        (await request.get(`/reports/sales-summary?from=${hoy}&to=${hoy}`).set(auth()).expect(200))
          .body.totals.revenue;

      const saleId = await despachado();
      const antes = await revenueDe();
      await request.post(`/sales/${saleId}/mark-delivered`).set(auth()).expect(201);
      // Marcar la entrega mueve el estado, NO la plata: el reporte no se inmuta.
      expect(await revenueDe()).toBeCloseTo(antes, 2);
    });
  });
});
