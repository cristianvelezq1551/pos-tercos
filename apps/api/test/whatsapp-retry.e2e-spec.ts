/**
 * §4.7: `retryFailedMessages` reintenta los envíos FALLIDOS (un `pickup_ready`
 * que falló es terminal → el cliente quedaría esperando para siempre). Sin test:
 * un retry mal hecho spamea; sin retry, el cliente pagó y nadie le avisa. Cubre:
 * reintento tras un fallo (Mock reenvía), idempotencia por flag (no duplica) y el
 * tope de 5 intentos.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { NotificationService } from '../src/notifications/notification.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { withDeliveringWhatsApp } from './helpers/whatsapp-provider';

describe('Reintento de WhatsApp fallido E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let notifications: NotificationService;
  let token: string;
  let productId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const phone = () => `+57302${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;

  const createPickup = async (): Promise<string> => {
    const res = await request
      .post('/web/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'WEB_PICKUP', items: [{ productId, quantity: 1 }], customerName: 'Cliente Retry', customerPhone: phone() })
      .expect(201);
    const saleId = res.body.order.id as string;
    // El `notify` del create es fire-and-forget → esperar a que el MENSAJE
    // inicial se persista (último paso del envío) ANTES de manipular.
    for (let i = 0; i < 60; i++) {
      if ((await sentCount(saleId, 'payment_instructions')) >= 1) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    return saleId;
  };

  const failedCount = (saleId: string, stage: string) =>
    prisma.whatsAppMessage.count({ where: { saleId, stage, status: 'failed' } });
  const sentCount = (saleId: string, stage: string) =>
    prisma.whatsAppMessage.count({ where: { saleId, stage, status: 'sent' } });

  beforeAll(async () => {
    // El reintento solo tiene sentido con un proveedor que entregue: el mock
    // por defecto declara `delivers:false` y `notify` sale sin enviar (§7.v22).
    ({ app, prisma, request } = await bootstrapApp(withDeliveringWhatsApp));
    notifications = app.get(NotificationService);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'dueno-wr@test.local', fullName: 'Dueño WR', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    token = await loginAs(request, 'dueno-wr@test.local');
    const prod = await request
      .post('/products')
      .set(auth())
      .send({ category: 'Test', name: 'Coca Retry', basePrice: 5000, directResale: true, unitPurchase: 'caja', unitStock: 'unit', conversionFactor: 24, modifiersEnabled: false })
      .expect(201);
    productId = prod.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('reintenta un envío fallido y el Mock lo entrega (flag idempotente queda en true)', async () => {
    const saleId = await createPickup(); // create → payment_instructions 'sent' (Mock)
    // Simular que el 1er envío FALLÓ: flag liberado + fila 'failed'.
    await prisma.sale.update({ where: { id: saleId }, data: { notified_payment_instructions: false } });
    await prisma.whatsAppMessage.create({
      data: { saleId, stage: 'payment_instructions', toPhone: '+573001112233', body: 'x', status: 'failed' },
    });
    const sentBefore = await sentCount(saleId, 'payment_instructions');

    await notifications.retryFailedMessages();

    // El retry reenvió (Mock ok) → +1 'sent' y el flag quedó en true.
    expect(await sentCount(saleId, 'payment_instructions')).toBe(sentBefore + 1);
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(sale.notified_payment_instructions).toBe(true);
  });

  it('con el flag YA en true, el retry NO reenvía (idempotente por flag)', async () => {
    const saleId = await createPickup(); // flag true tras el create
    await prisma.whatsAppMessage.create({
      data: { saleId, stage: 'payment_instructions', toPhone: '+573001112233', body: 'x', status: 'failed' },
    });
    const sentBefore = await sentCount(saleId, 'payment_instructions');

    await notifications.retryFailedMessages();

    expect(await sentCount(saleId, 'payment_instructions')).toBe(sentBefore); // no reenvió
  });

  it('con 5 intentos fallidos NO reintenta (tope anti-martilleo)', async () => {
    const saleId = await createPickup();
    await prisma.sale.update({ where: { id: saleId }, data: { notified_payment_instructions: false } });
    // 5 filas 'failed' (ya llegó al tope) — pero el create dejó 1 'sent', así que
    // borramos esa para que el conteo de intentos sea solo los 5 fallidos.
    await prisma.whatsAppMessage.deleteMany({ where: { saleId, stage: 'payment_instructions' } });
    for (let i = 0; i < 5; i++) {
      await prisma.whatsAppMessage.create({
        data: { saleId, stage: 'payment_instructions', toPhone: '+573001112233', body: 'x', status: 'failed' },
      });
    }

    await notifications.retryFailedMessages();

    // No hubo nuevo intento (ni 'sent' ni 'failed' adicional) y el flag sigue false.
    expect(await sentCount(saleId, 'payment_instructions')).toBe(0);
    expect(await failedCount(saleId, 'payment_instructions')).toBe(5);
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(sale.notified_payment_instructions).toBe(false);
  });
});
