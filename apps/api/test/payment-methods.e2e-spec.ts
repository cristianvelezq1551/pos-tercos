/**
 * E2E de medios de pago DINÁMICOS: defaults CASH+TRANSFER, el cobro rechaza
 * métodos deshabilitados, el admin crea/edita/borra métodos custom, CASH es del
 * sistema (no se borra) y nunca puede quedar el POS sin formas de cobrar.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Medios de pago dinámicos E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cocaId: string;

  const auth = () => ({ Authorization: `Bearer ${duenoToken}` });

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
      .set(auth())
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
      .set(auth())
      .send({ entityType: 'PRODUCT', productId: cocaId, delta: 40, type: 'INITIAL', unitCost: 1500 })
      .expect(201);
    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const sellWith = async (method: string) => {
    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: cocaId, quantity: 1 }] })
      .expect(201);
    return request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set(auth())
      .send({ method, amountReceived: 5000, digitalDoubleVerified: method !== 'CASH' || undefined });
  };

  it('defaults: solo Efectivo y Transferencia habilitados', async () => {
    const res = await request.get('/payment-methods').set(auth()).expect(200);
    const codes = res.body.map((m: { code: string }) => m.code).sort();
    expect(codes).toEqual(['CASH', 'TRANSFER']);
  });

  it('el catálogo completo NO trae Daviplata ni QR Bancolombia', async () => {
    const res = await request.get('/payment-methods/all').set(auth()).expect(200);
    const codes = res.body.map((m: { code: string }) => m.code);
    expect(codes).toEqual(expect.arrayContaining(['CASH', 'TRANSFER', 'CARD', 'NEQUI']));
    expect(codes).not.toContain('DAVIPLATA');
    expect(codes).not.toContain('QR_BANCOLOMBIA');
    const cash = res.body.find((m: { code: string }) => m.code === 'CASH');
    expect(cash).toMatchObject({ name: 'Efectivo', isCash: true, isSystem: true });
  });

  it('cobrar con un método DESHABILITADO (NEQUI) → 400 con mensaje claro', async () => {
    const res = await sellWith('NEQUI');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('no está habilitado');
  });

  it('el admin habilita Tarjeta (PATCH) y el cobro con CARD pasa', async () => {
    await request.patch('/payment-methods/CARD').set(auth()).send({ enabled: true }).expect(200);
    const res = await sellWith('CARD');
    expect(res.status).toBe(201);
    expect(res.body.paymentMethod).toBe('CARD');
  });

  it('crear un método custom (Rappi) → code derivado, digital, se puede cobrar', async () => {
    const created = await request
      .post('/payment-methods')
      .set(auth())
      .send({ name: 'Rappi Pay', requiresVerification: true })
      .expect(201);
    expect(created.body).toMatchObject({
      code: 'RAPPI_PAY',
      name: 'Rappi Pay',
      enabled: true,
      isCash: false,
      requiresVerification: true,
      isSystem: false,
    });
    // Digital: sin verificar comprobante → 400.
    const noVerify = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: cocaId, quantity: 1 }] })
      .expect(201);
    const rejected = await request
      .post(`/sales/${noVerify.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'RAPPI_PAY', amountReceived: 5000 });
    expect(rejected.status).toBe(400);
    // Con verificación → cobra.
    const ok = await sellWith('RAPPI_PAY');
    expect(ok.status).toBe(201);
    expect(ok.body.paymentMethod).toBe('RAPPI_PAY');
  });

  it('editar el nombre de un método custom', async () => {
    const res = await request
      .patch('/payment-methods/RAPPI_PAY')
      .set(auth())
      .send({ name: 'Rappi' })
      .expect(200);
    expect(res.body.name).toBe('Rappi');
  });

  it('no se puede borrar CASH (método del sistema) → 400', async () => {
    const res = await request.delete('/payment-methods/CASH').set(auth());
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('sistema');
  });

  it('borrar un método custom → desaparece del catálogo', async () => {
    await request.delete('/payment-methods/RAPPI_PAY').set(auth()).expect(200);
    const res = await request.get('/payment-methods/all').set(auth()).expect(200);
    expect(res.body.map((m: { code: string }) => m.code)).not.toContain('RAPPI_PAY');
  });

  it('no se puede deshabilitar el último método (el POS no puede quedar sin cobrar)', async () => {
    // Enabled ahora: CASH, TRANSFER, CARD → deshabilitar hasta el último.
    await request.patch('/payment-methods/CARD').set(auth()).send({ enabled: false }).expect(200);
    await request.patch('/payment-methods/TRANSFER').set(auth()).send({ enabled: false }).expect(200);
    const last = await request.patch('/payment-methods/CASH').set(auth()).send({ enabled: false });
    expect(last.status).toBe(400);
  });
});
