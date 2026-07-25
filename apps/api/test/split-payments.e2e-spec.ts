/**
 * E2E de pagos divididos (cuenta separada): N partes con método propio que
 * suman exacto el total, persistidas en sale_payments (fuente única de
 * verdad del método). Verifica las integraciones financieras: caja cuenta
 * solo la porción CASH, el Z-report desglosa por método real y la
 * reconciliación matchea cada transferencia individual.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Pagos divididos E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cajeroToken: string;
  let cocaId: string;
  let shiftId: string;
  let splitSaleId: string;

  const createSale = async (quantity: number) => {
    const res = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: cocaId, quantity }] })
      .expect(201);
    return res.body as { id: string; total: number };
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Auto-aislada: no confiar en que la suite anterior limpió. Esta suite lee
    // agregados GLOBALES (reportes / ledger de inventario), así que un residuo
    // de otra suite mueve los números y el fallo depende del orden de archivos.
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-split@test.local',
          fullName: 'Dueño Split',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'cajero-split@test.local',
          fullName: 'Cajero Split',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
    });
    duenoToken = await loginAs(request, 'dueno-split@test.local');
    cajeroToken = await loginAs(request, 'cajero-split@test.local');


    // NEQUI viene deshabilitado por defecto (medios de pago configurables).
    await request
      .patch('/payment-methods/NEQUI')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ enabled: true })
      .expect(200);

    const prodRes = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ category: 'Test',
        name: 'Coca Split',
        basePrice: 5000,
        directResale: true,
        unitPurchase: 'caja',
        unitStock: 'unit',
        conversionFactor: 24,
        modifiersEnabled: false,
      })
      .expect(201);
    cocaId = prodRes.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'PRODUCT', productId: cocaId, delta: 50, type: 'INITIAL', unitCost: 1500 })
      .expect(201);

    const shiftRes = await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ openingCash: 50000 })
      .expect(201);
    shiftId = shiftRes.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('divide $15.000 en CASH $8.000 (con vuelto) + NEQUI $7.000: PAGADO con 2 pagos', async () => {
    const sale = await createSale(3); // 3 × 5.000 = 15.000
    splitSaleId = sale.id;
    const res = await request
      .post(`/sales/${sale.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        payments: [
          { method: 'CASH', amount: 8000, amountReceived: 10000 },
          { method: 'NEQUI', amount: 7000, digitalVerified: true },
        ],
      })
      .expect(201);

    expect(res.body.status).toBe('PAGADO');
    // Resumen denormalizado: cuenta dividida → sin método único.
    expect(res.body.paymentMethod).toBeNull();
    expect(res.body.payments).toHaveLength(2);
    const cash = res.body.payments.find((p: { method: string }) => p.method === 'CASH');
    expect(cash.amount).toBe(8000);
    expect(cash.amountReceived).toBe(10000); // vuelto $2.000 lo calcula el POS
    const nequi = res.body.payments.find((p: { method: string }) => p.method === 'NEQUI');
    expect(nequi.amountReceived).toBeNull();
  });

  it('rechaza partes que no suman el total exacto', async () => {
    const sale = await createSale(1); // 5.000
    await request
      .post(`/sales/${sale.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        payments: [
          { method: 'CASH', amount: 2000 },
          { method: 'CASH', amount: 2000 },
        ],
      })
      .expect(400);
  });

  it('rechaza una parte digital sin verificar su comprobante', async () => {
    const sale = await createSale(1);
    await request
      .post(`/sales/${sale.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        payments: [
          { method: 'CASH', amount: 2000 },
          { method: 'NEQUI', amount: 3000 }, // sin digitalVerified
        ],
      })
      .expect(400);
  });

  it('rechaza efectivo recibido menor que la parte', async () => {
    const sale = await createSale(1);
    await request
      .post(`/sales/${sale.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        payments: [
          { method: 'CASH', amount: 3000, amountReceived: 2500 },
          { method: 'NEQUI', amount: 2000, digitalVerified: true },
        ],
      })
      .expect(400);
  });

  it('el recibo ESC/POS imprime el desglose de la cuenta dividida y abre el cajón', async () => {
    const res = await request
      .get(`/sales/${splitSaleId}/escpos`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(200);
    const bytes = Buffer.from(res.body.escposBase64 as string, 'base64').toString('latin1');
    expect(bytes).toContain('PAGOS (cuenta dividida)');
    expect(bytes).toContain('Efectivo');
    expect(bytes).toContain('Nequi');
    expect(bytes).toContain('recibido / vuelto');
  });

  it('la reconciliación matchea la transferencia por SU parte ($7.000), no por el total', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const csv = `fecha,monto,referencia\n${today},7000,NEQ-SPLIT-1`;
    const res = await request
      .post('/reports/payment-reconciliation/import?source=NEQUI_CSV')
      .set('Authorization', `Bearer ${duenoToken}`)
      .attach('file', Buffer.from(csv), 'nequi.csv')
      .expect(201);
    expect(res.body.summary.matched).toBe(1);
    expect(res.body.summary.unmatchedCsv).toBe(0);
    const matched = res.body.rows.find((r: { status: string }) => r.status === 'matched');
    expect(matched.saleTotal).toBe(7000); // la PARTE, no los 15.000
    expect(matched.saleId).toBe(splitSaleId);
  });

  it('el Z-report desglosa por método real y la caja espera SOLO la porción CASH', async () => {
    const detail = await request
      .get(`/shifts/${shiftId}/detail`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(200);
    const byMethod = detail.body.summary.byMethod as Array<{
      method: string;
      total: number;
      count: number;
    }>;
    const cash = byMethod.find((m) => m.method === 'CASH');
    const nequi = byMethod.find((m) => m.method === 'NEQUI');
    expect(cash?.total).toBe(8000);
    expect(nequi?.total).toBe(7000);

    // cashRevenue/transferRevenue del resumen son split-aware: salen de
    // sale_payments, no de sale.paymentMethod (que es null en una cuenta
    // dividida). La porción CASH de la venta dividida cuenta los $8.000.
    expect(detail.body.summary.cashRevenue).toBe(8000);
    expect(detail.body.summary.transferRevenue).toBe(0);

    // Cierre: esperado = apertura 50.000 + porción CASH 8.000 (la NEQUI no
    // entra al cajón). Contado exacto → diferencia 0. Arqueo DIGITAL: la app
    // de Nequi muestra 6.000 (faltan 1.000 vs la parte vendida de 7.000).
    const close = await request
      .post(`/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        countedCash: 58000,
        digitalCounts: [{ method: 'NEQUI', counted: 6000 }],
      })
      .expect(201);
    expect(Number(close.body.expectedCash)).toBe(58000);
    expect(Number(close.body.difference)).toBe(0);

    const digital = close.body.digitalCountBreakdown as Array<{
      method: string;
      expected: number;
      counted: number | null;
      difference: number | null;
    }>;
    const nequiLine = digital.find((d) => d.method === 'NEQUI');
    expect(nequiLine).toEqual({
      method: 'NEQUI',
      expected: 7000,
      counted: 6000,
      difference: -1000,
    });
  });
});
