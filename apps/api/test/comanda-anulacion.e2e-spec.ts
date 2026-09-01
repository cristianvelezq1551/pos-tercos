/**
 * El ticket de ANULACIÓN —el papel con el número gigante que le dice a la
 * cocina que descarte un pedido que ya está en la plancha— fallaba SIEMPRE.
 *
 * Se imprime justo DESPUÉS de anular, así que para entonces la venta ya está
 * en `VOID`, y el gate de la comanda solo aceptaba estados vivos. El cajero
 * veía "El ticket de ANULACIÓN para cocina no se pudo imprimir" cada vez, con
 * el resto de los recibos saliendo bien.
 *
 * Reportado en producción por el dueño el 2026-08-31.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Ticket de anulación E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let productId: string;

  const PRICE = 12_000;
  const PIN = '123456';

  const texto = (base64: string): string => Buffer.from(base64, 'base64').toString('latin1');

  const venderYPagar = async (): Promise<string> => {
    const venta = await request
      .post('/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
      .expect(201);
    await request
      .post(`/sales/${venta.body.id}/confirm-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH', amountReceived: PRICE })
      .expect(201);
    return venta.body.id as string;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const dueno = await prisma.user.create({
      data: {
        email: 'dueno-anulacion@test.local',
        fullName: 'Dueño Anulación',
        role: 'DUENO',
        passwordHash: await bcrypt.hash('dev12345', 10),
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-anulacion@test.local');
    await prisma.approvalPin.create({
      data: { userId: dueno.id, pinHash: await bcrypt.hash(PIN, 10) },
    });

    // `products.create` exige que la categoría exista y `cleanDb` no las
    // recrea: en una base de test nueva hay que sembrarla.
    await prisma.productCategory.upsert({
      where: { name: 'Burgers' },
      update: {},
      create: { name: 'Burgers' },
    });

    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Hamburguesa Anulación',
        category: 'Burgers',
        basePrice: PRICE,
        directResale: true,
        unitPurchase: 'unidad',
        unitStock: 'unidad',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    productId = prod.body.id;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ entityType: 'PRODUCT', productId, delta: 50, type: 'INITIAL', notes: 'stock' })
      .expect(201);

    await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ openingCash: 100_000 })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('sale DESPUÉS de anular la venta (era el caso que fallaba)', async () => {
    const saleId = await venderYPagar();
    await request
      .post(`/sales/${saleId}/void`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Approval-Pin', PIN)
      .send({ reason: 'el cliente se arrepintió' })
      .expect(201);

    const anulada = await prisma.sale.findUnique({ where: { id: saleId } });
    expect(anulada!.status).toBe('VOID');

    const res = await request
      .get(`/sales/${saleId}/comanda-escpos?cancel=true`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const papel = texto(res.body.escposBase64 as string);
    expect(papel).toContain('DESCARTAR ESTE PEDIDO');
    expect(papel).toContain('Hamburguesa Anulación');
  });

  it('también sale al cancelar una cuenta abierta que ya fue a cocina', async () => {
    const venta = await request
      .post('/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'COUNTER',
        openTab: true,
        customerName: 'Mesa 3',
        items: [{ productId, quantity: 2 }],
      })
      .expect(201);
    await request
      .post(`/sales/${venta.body.id}/send-to-kitchen`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request
      .post(`/sales/${venta.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'se fue sin pagar' })
      .expect(200);

    const res = await request
      .get(`/sales/${venta.body.id}/comanda-escpos?cancel=true`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(texto(res.body.escposBase64 as string)).toContain('DESCARTAR ESTE PEDIDO');
  });

  it('una comanda NORMAL de una venta anulada sigue rechazada', async () => {
    const saleId = await venderYPagar();
    await request
      .post(`/sales/${saleId}/void`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Approval-Pin', PIN)
      .send({ reason: 'prueba' })
      .expect(201);

    const res = await request
      .get(`/sales/${saleId}/comanda-escpos`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    // El mensaje le habla a una persona: nombre del estado, no el del enum.
    expect(res.body.message).toContain('Anulado');
    expect(res.body.message).not.toContain('VOID');
  });
});
