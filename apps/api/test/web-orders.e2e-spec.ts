/**
 * web-orders.e2e-spec.ts
 *
 * Ciclo de vida COMPLETO de un pedido WEB_PICKUP tras eliminar el turnero/KDS:
 *   crear (público) → confirmar pago (cajero) → "marcar listo" (cajero).
 *
 * Cubre el endpoint POST /sales/:id/mark-ready (reemplazo de KdsService.ready):
 * transición PAGADO→LISTO_DESPACHO, guards de type/status, TOCTOU del doble
 * "marcar listo", y el disparo de las notificaciones WhatsApp en cada paso
 * (persistidas en whatsapp_messages vía MockWhatsAppAdapter).
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { withDeliveringWhatsApp } from './helpers/whatsapp-provider';

describe('Web Orders — ciclo de vida + mark-ready E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cajeroToken: string;
  let gaseosaId: string;

  /** Las notificaciones son fire-and-forget: la fila en whatsapp_messages se
   *  escribe después de responder el HTTP. Reintenta hasta verla. */
  const waitForWhatsApp = async (
    saleId: string,
    stage: string,
    tries = 25,
  ): Promise<{ status: string; body: string } | null> => {
    for (let i = 0; i < tries; i++) {
      const msg = await prisma.whatsAppMessage.findFirst({
        where: { saleId, stage },
        select: { status: true, body: true },
      });
      if (msg) return msg;
      await new Promise((r) => setTimeout(r, 40));
    }
    return null;
  };

  /** La respuesta cruda del create — los tests de datos de pago miran
   *  `paymentInstructions`, que vive fuera de `order`. */
  const createWebOrderRaw = (over: { customerPhone: string }) =>
    request
      .post('/web/orders')
      .send({
        type: 'WEB_PICKUP',
        items: [{ productId: gaseosaId, quantity: 1 }],
        customerName: 'Cliente Web',
        ...over,
      })
      .expect(201);

  const createWebOrder = async (): Promise<{ id: string; total: number }> => {
    const res = await request
      .post('/web/orders')
      .send({
        type: 'WEB_PICKUP',
        items: [{ productId: gaseosaId, quantity: 1 }],
        customerName: 'Cliente Web',
        customerPhone: '+573001234567',
      })
      .expect(201);
    return { id: res.body.order.id as string, total: res.body.order.total as number };
  };

  const confirmPayment = (saleId: string, total: number) =>
    request
      .post(`/sales/${saleId}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ method: 'CASH', amountReceived: total });

  beforeAll(async () => {
    // Esta suite verifica las notificaciones AUTOMÁTICAS: necesita un proveedor
    // que entregue (el mock por defecto ya no finge envíos — §7.v22).
    ({ app, prisma, request } = await bootstrapApp(withDeliveringWhatsApp));
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-web@test.local', fullName: 'Dueño Web', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-web@test.local', fullName: 'Cajero Web', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
    });
    duenoToken = await loginAs(request, 'dueno-web@test.local');
    cajeroToken = await loginAs(request, 'cajero-web@test.local');

    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ category: 'Test',
        name: 'Gaseosa Web',
        basePrice: 5000,
        directResale: true,
        unitPurchase: 'unit',
        unitStock: 'unit',
        conversionFactor: 1,
        modifiersEnabled: false,
      })
      .expect(201);
    gaseosaId = prod.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'PRODUCT', productId: gaseosaId, delta: 100, type: 'INITIAL', unitCost: 2000 })
      .expect(201);

    // El cobro de un pedido web asocia turno+cajero → necesita la caja abierta.
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

  it('crear pedido web dispara las instrucciones de pago por WhatsApp', async () => {
    const order = await createWebOrder();
    const msg = await waitForWhatsApp(order.id, 'payment_instructions');
    expect(msg).not.toBeNull();
    expect(msg!.status).toBe('sent');
  });

  it('flujo completo: confirmar pago → PAGADO + payment_received; marcar listo → LISTO_DESPACHO + pickup_ready', async () => {
    const order = await createWebOrder();

    // Cajero confirma el pago.
    const paid = await confirmPayment(order.id, order.total).expect(201);
    expect(paid.body.status).toBe('PAGADO');
    const received = await waitForWhatsApp(order.id, 'payment_received');
    expect(received?.status).toBe('sent');

    // Cajero marca "listo para retirar".
    const ready = await request
      .post(`/sales/${order.id}/mark-ready`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(201);
    expect(ready.body.status).toBe('LISTO_DESPACHO');

    // readyAt quedó sellado (lo usa el dashboard "listos hoy").
    const row = await prisma.sale.findUniqueOrThrow({
      where: { id: order.id },
      select: { readyAt: true },
    });
    expect(row.readyAt).not.toBeNull();

    // Y el cliente recibió el "listo para retirar".
    const pickup = await waitForWhatsApp(order.id, 'pickup_ready');
    expect(pickup?.status).toBe('sent');

    // sale_status_log registró la transición.
    const log = await prisma.saleStatusLog.findFirst({
      where: { saleId: order.id, statusTo: 'LISTO_DESPACHO' },
    });
    expect(log).toBeTruthy();
  });

  it('mark-ready rechaza un pedido WEB que todavía NO está pagado (400)', async () => {
    const order = await createWebOrder();
    await request
      .post(`/sales/${order.id}/mark-ready`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(400);
  });

  it('mark-ready rechaza una venta COUNTER (solo aplica a WEB_PICKUP) (400)', async () => {
    const created = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: gaseosaId, quantity: 1 }] })
      .expect(201);
    await confirmPayment(created.body.id, created.body.total).expect(201);

    await request
      .post(`/sales/${created.body.id}/mark-ready`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(400);
  });

  it('mark-ready dos veces: el segundo es 400 (guard TOCTOU por status) y no reenvía WhatsApp', async () => {
    const order = await createWebOrder();
    await confirmPayment(order.id, order.total).expect(201);

    await request
      .post(`/sales/${order.id}/mark-ready`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(201);
    await request
      .post(`/sales/${order.id}/mark-ready`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(400);

    // Exactamente UN pickup_ready (idempotencia del flag notified_*).
    await waitForWhatsApp(order.id, 'pickup_ready');
    const count = await prisma.whatsAppMessage.count({
      where: { saleId: order.id, stage: 'pickup_ready' },
    });
    expect(count).toBe(1);
  });

  // ================================================================
  // #13 — anti-abuso del pedido web público
  // ================================================================

  it('#13 tope por teléfono: al 3er pedido PENDIENTE del día, el siguiente se rechaza', async () => {
    const phone = '+573009998877';
    const body = {
      type: 'WEB_PICKUP',
      items: [{ productId: gaseosaId, quantity: 1 }],
      customerName: 'Abusador',
      customerPhone: phone,
    };
    // Los pedidos previos de otros tests usan OTRO teléfono → no cuentan.
    for (let i = 0; i < 3; i++) {
      const created = await request.post('/web/orders').send(body).expect(201);
      // Drenar el WhatsApp fire-and-forget (si queda en vuelo, deadlockea el
      // TRUNCATE del afterAll).
      await waitForWhatsApp(created.body.order.id as string, 'payment_instructions');
    }
    const res = await request.post('/web/orders').send(body).expect(400);
    expect(String(res.body.message)).toContain('sin pagar');

    // Pagar uno libera el cupo (los pagados no cuentan).
    const pending = await prisma.sale.findFirst({
      where: { customerPhone: phone, status: 'PENDIENTE_PAGO' },
      select: { id: true, total: true },
    });
    await confirmPayment(pending!.id, Number(pending!.total)).expect(201);
    await waitForWhatsApp(pending!.id, 'payment_received');
    const freed = await request.post('/web/orders').send(body).expect(201);
    await waitForWhatsApp(freed.body.order.id as string, 'payment_instructions');
  });

  it('#13 kill-switch: con webOrdersEnabled=false el pedido se rechaza 503 y al reactivar vuelve', async () => {
    await prisma.businessConfig.upsert({
      where: { id: 'singleton' },
      update: { webOrdersEnabled: false },
      create: { id: 'singleton', webOrdersEnabled: false },
    });
    const body = {
      type: 'WEB_PICKUP',
      items: [{ productId: gaseosaId, quantity: 1 }],
      customerName: 'Cliente Web',
      customerPhone: '+573001112233',
    };
    const res = await request.post('/web/orders').send(body).expect(503);
    expect(String(res.body.message)).toContain('deshabilitados');

    // El menú público expone el flag para que la web oculte el checkout.
    // (cache TTL del menú: se consulta directo el config acá)
    await prisma.businessConfig.update({
      where: { id: 'singleton' },
      data: { webOrdersEnabled: true },
    });
    const reopened = await request.post('/web/orders').send(body).expect(201);
    await waitForWhatsApp(reopened.body.order.id as string, 'payment_instructions');
  });
  /**
   * La nota del cliente ("sin cebolla") se guardaba en la venta pero NO salía
   * en el DTO público, así que el mensaje de WhatsApp que arma la web —que se
   * construye desde ese DTO— la perdía: el cliente escribía una indicación y
   * nadie la veía nunca. Sin este test el campo se puede volver a caer sin que
   * nada se ponga rojo.
   */
  it('la nota del pedido viaja al DTO público, al crear y al consultar', async () => {
    const res = await request
      .post('/web/orders')
      .send({
        type: 'WEB_PICKUP',
        items: [{ productId: gaseosaId, quantity: 1 }],
        customerName: 'Cliente Web',
        customerPhone: '+573001234599',
        notes: 'sin cebolla, salsa aparte',
      })
      .expect(201);
    expect(res.body.order.notes).toBe('sin cebolla, salsa aparte');

    const consultado = await request
      .get(`/web/orders/${res.body.order.id}?token=${encodeURIComponent(res.body.token as string)}`)
      .expect(200);
    expect(consultado.body.notes).toBe('sin cebolla, salsa aparte');
  });

  it('un pedido sin nota devuelve null, no undefined ni cadena vacía', async () => {
    const { id } = await createWebOrder();
    const sale = await prisma.sale.findUnique({ where: { id }, select: { notes: true } });
    expect(sale?.notes).toBeNull();
  });

  /**
   * Los datos de pago pasaron de variables de entorno a `business_config`
   * (editables por el dueño en el admin). Las env vars quedaron de RESPALDO:
   * si la lista está vacía el cliente no puede quedarse sin saber a dónde pagar.
   */
  describe('datos de pago', () => {
    afterEach(async () => {
      await prisma.businessConfig.update({
        where: { id: 'singleton' },
        data: { paymentAccounts: [] },
      });
    });

    it('las cuentas cargadas por el dueño salen en las instrucciones', async () => {
      await prisma.businessConfig.upsert({
        where: { id: 'singleton' },
        update: {
          paymentAccounts: [
            { label: 'Nequi', value: '3046706847', note: 'a nombre de Tercos' },
            { label: 'Bancolombia ahorros', value: '12345678', note: '' },
          ],
        },
        create: { id: 'singleton' },
      });

      const res = await createWebOrderRaw({ customerPhone: '+573001234588' });
      const instrucciones = String(res.body.paymentInstructions);

      // El número va SOLO en su línea: es lo que permite copiarlo de un toque.
      expect(instrucciones.split('\n')).toContain('3046706847');
      expect(instrucciones.split('\n')).toContain('12345678');
      expect(instrucciones).toContain('Nequi');
      expect(instrucciones).toContain('a nombre de Tercos');
    });

    it('sin cuentas cargadas no se deja al cliente sin a dónde pagar', async () => {
      const res = await createWebOrderRaw({ customerPhone: '+573001234577' });
      const instrucciones = String(res.body.paymentInstructions);
      // Sin cuentas Y sin env vars: mensaje genérico, nunca un texto vacío ni
      // un detalle técnico sobre variables de entorno.
      expect(instrucciones).toContain('Total a pagar');
      expect(instrucciones.trim().length).toBeGreaterThan(20);
      expect(instrucciones).not.toContain('undefined');
      expect(instrucciones).not.toContain('PAYMENT_INSTRUCTIONS');
    });

    it('una cuenta a medio cargar no se cuela en el mensaje', async () => {
      await prisma.businessConfig.update({
        where: { id: 'singleton' },
        // Rótulo sin número: mostrarlo sería decirle "paga a Nequi" sin decir
        // a cuál. El builder la descarta.
        data: { paymentAccounts: [{ label: 'Nequi', value: '   ', note: '' }] },
      });
      const res = await createWebOrderRaw({ customerPhone: '+573001234566' });
      expect(String(res.body.paymentInstructions)).not.toContain('Nequi');
    });
  });


  // ================================================================
  // Regresiones del Zod público de POST /web/orders (hardening)
  // ================================================================

  describe('hardening del payload público', () => {
    let perroModsId: string;
    let quesoModId: string;

    beforeAll(async () => {
      // Producto con un modificador REAL: el 400 de duplicados debe probarse
      // contra un payload que sin la repetición sería perfectamente válido.
      const prod = await request
        .post('/products')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          name: 'Perro Web Mods',
          category: 'Test',
          basePrice: 8000,
          directResale: false,
          isCombo: false,
          modifiersEnabled: true,
          modifiers: [{ name: 'Queso extra', priceDelta: 2000 }],
        })
        .expect(201);
      perroModsId = prod.body.id as string;
      quesoModId = prod.body.modifiers[0].id as string;
    });

    // Bug: WebOrderItemSchema heredaba manualDiscount del POS → un anónimo creaba pedidos con hasta 100% de descuento por API.
    it('manualDiscount en un ítem del pedido web se DESCARTA: el total sale completo', async () => {
      const res = await request
        .post('/web/orders')
        .send({
          type: 'WEB_PICKUP',
          items: [
            {
              productId: gaseosaId,
              quantity: 1,
              manualDiscount: { kind: 'PERCENT', value: 100 },
            },
          ],
          customerName: 'Cliente Vivo',
          customerPhone: '+573017770001',
        })
        .expect(201);

      // Antes: total $0. Ahora el Zod (strip) descarta el campo y se cobra completo.
      expect(res.body.order.subtotal).toBe(5000);
      expect(res.body.order.discountTotal).toBe(0);
      expect(res.body.order.total).toBe(5000);
      // Drenar el WhatsApp fire-and-forget (si queda en vuelo, deadlockea el
      // TRUNCATE del afterAll).
      await waitForWhatsApp(res.body.order.id as string, 'payment_instructions');
    });

    // Bug: `modifiers` aceptaba el mismo modifierId repetido → sumaba precio y consumo N veces (y en el endpoint público manipulaba el precio).
    it('el mismo modificador repetido en una línea es 400; sin repetir, el mismo payload entra', async () => {
      const base = {
        type: 'WEB_PICKUP',
        customerName: 'Cliente Mods',
        customerPhone: '+573017770002',
      };

      const dup = await request
        .post('/web/orders')
        .send({
          ...base,
          items: [
            {
              productId: perroModsId,
              quantity: 1,
              modifiers: [{ modifierId: quesoModId }, { modifierId: quesoModId }],
            },
          ],
        })
        .expect(400);
      expect(String(dup.body.message)).toContain('repetido');

      // Control: el rechazo es por la repetición, no por el modificador en sí.
      const ok = await request
        .post('/web/orders')
        .send({
          ...base,
          items: [
            { productId: perroModsId, quantity: 1, modifiers: [{ modifierId: quesoModId }] },
          ],
        })
        .expect(201);
      expect(ok.body.order.total).toBe(10000); // 8000 + 2000 del extra, UNA sola vez
      await waitForWhatsApp(ok.body.order.id as string, 'payment_instructions');
    });
  });
});
