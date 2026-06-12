/**
 * E2E de medios de pago configurables: defaults CASH+TRANSFER, el cobro
 * rechaza métodos deshabilitados, el admin habilita/deshabilita, y nunca
 * puede quedar el POS sin formas de cobrar.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Medios de pago configurables E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cocaId: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-pm@test.local',
        fullName: 'Dueño Medios',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-pm@test.local');

    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Coca Medios',
        basePrice: 5000,
        directResale: true,
        unitPurchase: 'caja',
        unitStock: 'unit',
        conversionFactor: 24,
        modifiersEnabled: false,
      })
      .expect(201);
    cocaId = prod.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'PRODUCT', productId: cocaId, delta: 20, type: 'INITIAL', unitCost: 1500 })
      .expect(201);
    await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ openingCash: 0 })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const sellWith = async (method: string) => {
    const sale = await request
      .post('/sales')
      .set('Authorization', `Bearer ${duenoToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: cocaId, quantity: 1 }] })
      .expect(201);
    return request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ method, amountReceived: 5000, digitalDoubleVerified: method !== 'CASH' || undefined });
  };

  it('defaults: solo Efectivo y Transferencia habilitados', async () => {
    const res = await request
      .get('/payment-methods')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const methods = res.body.map((m: { method: string }) => m.method).sort();
    expect(methods).toEqual(['CASH', 'TRANSFER']);
  });

  it('cobrar con un método DESHABILITADO (NEQUI) → 400 con mensaje claro', async () => {
    const res = await sellWith('NEQUI');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('no está habilitado');
  });

  it('el admin habilita Tarjeta y el cobro con CARD pasa (con voucher verificado)', async () => {
    await request
      .put('/payment-methods')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ methods: [{ method: 'CARD', enabled: true }] })
      .expect(200);
    const res = await sellWith('CARD');
    expect(res.status).toBe(201);
    expect(res.body.paymentMethod).toBe('CARD');
  });

  it('no se puede deshabilitar TODO (el POS no puede quedar sin cobrar)', async () => {
    await request
      .put('/payment-methods')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        methods: [
          { method: 'CASH', enabled: false },
          { method: 'TRANSFER', enabled: false },
          { method: 'CARD', enabled: false },
          { method: 'NEQUI', enabled: false },
          { method: 'DAVIPLATA', enabled: false },
          { method: 'QR_BANCOLOMBIA', enabled: false },
        ],
      })
      .expect(400);
  });
});
