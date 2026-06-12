/**
 * sales-edit.e2e-spec.ts
 *
 * Correcciones del mostrador sobre ventas cobradas:
 *  - Editar productos según el estado en cocina (PAGADO = todo;
 *    EN_PREPARACION = solo reventa directa)
 *  - Ajuste de stock por la DIFERENCIA de consumo
 *  - Cambiar método/división de pago (reclasificación contra descuadres)
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Sales Edit E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;
  let cocineroToken: string;

  let papasId: string; // preparación (no reventa)
  let gaseosaId: string; // reventa directa (stock propio)

  const PAPAS_PRICE = 5000;
  const GASEOSA_PRICE = 4000;

  const createPaidSale = async (
    items: Array<{ productId: string; quantity: number }>,
    method = 'CASH',
  ): Promise<{ id: string; total: number }> => {
    const created = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items })
      .expect(201);
    const paid = await request
      .post(`/sales/${created.body.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send(
        method === 'CASH'
          ? { method, amountReceived: 100000 }
          : { method, amountReceived: created.body.total, digitalDoubleVerified: true },
      )
      .expect(201);
    return { id: paid.body.id as string, total: paid.body.total as number };
  };

  const gaseosaStock = async (): Promise<number> => {
    const agg = await prisma.inventoryMovement.aggregate({
      where: { productId: gaseosaId },
      _sum: { delta: true },
    });
    return Number(agg._sum.delta ?? 0);
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-edit@test.local', fullName: 'Dueño Edit', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-edit@test.local', fullName: 'Cajero Edit', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cocinero-edit@test.local', fullName: 'Cocinero Edit', role: 'COCINERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-edit@test.local');
    cajeroToken = await loginAs(request, 'cajero-edit@test.local');
    cocineroToken = await loginAs(request, 'cocinero-edit@test.local');

    // Producto de PREPARACIÓN (sin reventa).
    const papas = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Papas Edit',
        category: 'Comidas',
        basePrice: PAPAS_PRICE,
        isActive: true,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'unit',
        unitStock: 'unit',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    papasId = papas.body.id as string;

    // Producto de REVENTA con stock inicial 20.
    const gaseosa = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Gaseosa Edit',
        category: 'Bebidas',
        basePrice: GASEOSA_PRICE,
        isActive: true,
        directResale: true,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'unit',
        unitStock: 'unit',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    gaseosaId = gaseosa.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        entityType: 'PRODUCT',
        productId: gaseosaId,
        delta: 20,
        type: 'INITIAL',
        notes: 'stock inicial test',
      })
      .expect(201);

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

  describe('PATCH /sales/:id/items', () => {
    it('PAGADO: edita preparación y reventa, recalcula totales y ajusta pago + stock', async () => {
      const sale = await createPaidSale([
        { productId: papasId, quantity: 2 },
        { productId: gaseosaId, quantity: 1 },
      ]);
      expect(sale.total).toBe(2 * PAPAS_PRICE + GASEOSA_PRICE); // 14000
      const stockBefore = await gaseosaStock();

      const res = await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          items: [
            { productId: papasId, quantity: 1 },
            { productId: gaseosaId, quantity: 3 },
          ],
        })
        .expect(200);

      expect(res.body.total).toBe(PAPAS_PRICE + 3 * GASEOSA_PRICE); // 17000
      expect(res.body.items).toHaveLength(2);
      // El pago único se ajusta al nuevo total.
      expect(res.body.payments).toHaveLength(1);
      expect(res.body.payments[0].amount).toBe(17000);
      // Stock de la gaseosa: la edición consumió 2 más (1 → 3).
      expect(await gaseosaStock()).toBe(stockBefore - 2);

      // Audit con before/after.
      const log = await prisma.auditLog.findFirst({
        where: { action: 'SALE_ITEMS_EDITED', entityId: sale.id },
      });
      expect(log).toBeTruthy();
      expect((log!.metadata as { totalBefore: number }).totalBefore).toBe(14000);
      expect((log!.metadata as { totalAfter: number }).totalAfter).toBe(17000);
    });

    it('EN_PREPARACION: bloquea cambios de preparación, permite cambiar reventa', async () => {
      const sale = await createPaidSale([
        { productId: papasId, quantity: 2 },
        { productId: gaseosaId, quantity: 2 },
      ]);
      // La cocina inicia el pedido.
      await request
        .post(`/kds/orders/${sale.id}/start`)
        .set('Authorization', `Bearer ${cocineroToken}`)
        .expect(200);

      // Cambiar las papas (preparación) → 400.
      await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          items: [
            { productId: papasId, quantity: 1 },
            { productId: gaseosaId, quantity: 2 },
          ],
        })
        .expect(400);

      // Cambiar solo la bebida (reventa) → 200.
      const res = await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          items: [
            { productId: papasId, quantity: 2 },
            { productId: gaseosaId, quantity: 1 },
          ],
        })
        .expect(200);
      expect(res.body.total).toBe(2 * PAPAS_PRICE + GASEOSA_PRICE);
      expect(res.body.status).toBe('EN_PREPARACION');
    });

    it('rechaza editar una venta ENTREGADO', async () => {
      const sale = await createPaidSale([{ productId: gaseosaId, quantity: 1 }]);
      // listo → entregado (cocina marca listo, cajero entrega vía public-display)
      await request
        .post(`/kds/orders/${sale.id}/start`)
        .set('Authorization', `Bearer ${cocineroToken}`)
        .expect(200);
      await request
        .post(`/kds/orders/${sale.id}/ready`)
        .set('Authorization', `Bearer ${cocineroToken}`)
        .expect(200);
      await request
        .post(`/public-display/deliver/${sale.id}`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .expect(201);

      await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ items: [{ productId: gaseosaId, quantity: 2 }] })
        .expect(400);
    });
  });

  describe('PATCH /sales/:id/payment', () => {
    it('reclasifica CASH → TRANSFER (corrige descuadres)', async () => {
      const sale = await createPaidSale([{ productId: gaseosaId, quantity: 2 }], 'CASH');

      const res = await request
        .patch(`/sales/${sale.id}/payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ method: 'TRANSFER' })
        .expect(200);
      expect(res.body.paymentMethod).toBe('TRANSFER');
      expect(res.body.payments).toHaveLength(1);
      expect(res.body.payments[0].method).toBe('TRANSFER');
      expect(res.body.payments[0].amount).toBe(sale.total);

      const log = await prisma.auditLog.findFirst({
        where: { action: 'SALE_PAYMENT_CHANGED', entityId: sale.id },
      });
      expect(log).toBeTruthy();
    });

    it('re-divide el pago en partes que suman exacto (resumen queda NULL)', async () => {
      const sale = await createPaidSale([{ productId: gaseosaId, quantity: 2 }], 'CASH');
      const res = await request
        .patch(`/sales/${sale.id}/payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          payments: [
            { method: 'CASH', amount: 3000 },
            { method: 'TRANSFER', amount: sale.total - 3000 },
          ],
        })
        .expect(200);
      expect(res.body.paymentMethod).toBeNull();
      expect(res.body.payments).toHaveLength(2);
    });

    it('rechaza partes que no suman el total y métodos deshabilitados', async () => {
      const sale = await createPaidSale([{ productId: gaseosaId, quantity: 1 }], 'CASH');
      await request
        .patch(`/sales/${sale.id}/payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          payments: [
            { method: 'CASH', amount: 1000 },
            { method: 'TRANSFER', amount: 1000 },
          ],
        })
        .expect(400);
      // NEQUI está deshabilitado por defecto.
      await request
        .patch(`/sales/${sale.id}/payment`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ method: 'NEQUI' })
        .expect(400);
    });
  });
});
