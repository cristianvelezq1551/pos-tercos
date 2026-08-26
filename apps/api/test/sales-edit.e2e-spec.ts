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
    // Auto-aislada: no confiar en que la suite anterior limpió. Esta suite lee
    // agregados GLOBALES (reportes / ledger de inventario), así que un residuo
    // de otra suite mueve los números y el fallo depende del orden de archivos.
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-edit@test.local', fullName: 'Dueño Edit', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-edit@test.local', fullName: 'Cajero Edit', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-edit@test.local');
    cajeroToken = await loginAs(request, 'cajero-edit@test.local');

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

    it('LISTO_DESPACHO: bloquea cambios de preparación, permite cambiar reventa', async () => {
      const sale = await createPaidSale([
        { productId: papasId, quantity: 2 },
        { productId: gaseosaId, quantity: 2 },
      ]);
      // El pedido pasa a "listo para retirar" (web mark-ready). El guard de
      // edición ya no permite tocar líneas de preparación.
      await prisma.sale.update({
        where: { id: sale.id },
        data: { status: 'LISTO_DESPACHO' },
      });

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
      expect(res.body.status).toBe('LISTO_DESPACHO');
    });

    it('rechaza editar una venta ENTREGADO', async () => {
      const sale = await createPaidSale([{ productId: gaseosaId, quantity: 1 }]);
      await prisma.sale.update({
        where: { id: sale.id },
        data: { status: 'ENTREGADO' },
      });

      await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ items: [{ productId: gaseosaId, quantity: 2 }] })
        .expect(400);
    });
  });

  describe('Edición + anulación: integridad FIFO del stock', () => {
    const PIN = '778899';

    it('editar (quitar) y luego anular restaura el stock por el NETO consumido', async () => {
      // PIN de aprobación del dueño (requerido para anular).
      await request
        .post('/approvals/pin')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ pin: PIN, password: 'dev12345' })
        .expect((r) => {
          if (r.status >= 300) throw new Error(`PIN setup falló: ${r.status} ${JSON.stringify(r.body)}`);
        });

      const stock0 = await gaseosaStock();
      const sale = await createPaidSale([{ productId: gaseosaId, quantity: 3 }]); // consume 3
      expect(await gaseosaStock()).toBe(stock0 - 3);

      // Edición: quitar 2 (queda 1) → devuelve 2. Neto consumido = 1.
      await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ items: [{ productId: gaseosaId, quantity: 1 }] })
        .expect(200);
      expect(await gaseosaStock()).toBe(stock0 - 1);

      // Anular: reverso del NETO consumido (1) → stock 100% restaurado.
      await request
        .post(`/sales/${sale.id}/void`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('X-Approval-Pin', PIN)
        .send({ reason: 'prueba edición + anulación' })
        .expect(201);
      expect(await gaseosaStock()).toBe(stock0);

      // El void emite UN reverso por stockable = neto consumido (no uno por cada
      // movement): así el ledger FIFO netea a cero sin reversos parciales sueltos.
      const reversos = await prisma.inventoryMovement.findMany({
        where: { productId: gaseosaId, sourceId: sale.id, notes: { startsWith: 'Reverso de void' } },
      });
      expect(reversos).toHaveLength(1);
      expect(Number(reversos[0]!.delta)).toBe(1);
    });
  });

  // ==================================================================
  // D3 — una venta YA COBRADA no se re-precia al editar
  // ==================================================================
  describe('Precio congelado en ventas cobradas (D3)', () => {
    const mkProduct = async (
      name: string,
      basePrice: number,
      directResale = false,
    ): Promise<string> => {
      const res = await request
        .post('/products')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          name,
          category: directResale ? 'Bebidas' : 'Comidas',
          basePrice,
          isActive: true,
          directResale,
          isCombo: false,
          modifiersEnabled: false,
          unitPurchase: 'unit',
          unitStock: 'unit',
          conversionFactor: 1,
          thresholdMin: 0,
        })
        .expect(201);
      return res.body.id as string;
    };

    interface ItemBody {
      productId: string;
      quantity: number;
      unitPrice: number;
      lineDiscount: number;
      lineTotal: number;
      appliedPromotionId: string | null;
    }
    const lineOf = (body: { items: ItemBody[] }, productId: string): ItemBody => {
      const found = body.items.find((it) => it.productId === productId);
      if (!found) throw new Error(`La venta no tiene línea del producto ${productId}`);
      return found;
    };

    it('promo desactivada entre el cobro y la edición: la línea cobrada conserva su descuento', async () => {
      // Decisión 2026-08-25: agregar algo a un pedido pagado no le quita a lo
      // ya cobrado la promo con la que se cobró.
      const PRICE = 10000;
      const productId = await mkProduct('Burger D3 Promo', PRICE);
      const promo = await request
        .post('/promotions')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          name: 'Promo D3 20%',
          type: 'PERCENT_OFF',
          discountPct: 0.2,
          daysOfWeekMask: 127,
          timeStart: '00:00:00',
          timeEnd: '23:59:59',
          productIds: [productId],
        })
        .expect(201);
      const promoId = promo.body.id as string;

      const sale = await createPaidSale([{ productId, quantity: 1 }]);
      expect(sale.total).toBe(PRICE * 0.8);

      // La promo se apaga (soft delete) DESPUÉS del cobro.
      await request
        .delete(`/promotions/${promoId}`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .expect(200);

      const res = await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          items: [
            { productId, quantity: 1 },
            { productId: gaseosaId, quantity: 1 },
          ],
        })
        .expect(200);

      const frozen = lineOf(res.body, productId);
      expect(frozen.unitPrice).toBe(PRICE);
      expect(frozen.lineDiscount).toBe(PRICE * 0.2);
      expect(frozen.appliedPromotionId).toBe(promoId);
      // El total solo crece por lo agregado: la línea cobrada no se encarece.
      expect(res.body.total).toBe(sale.total + GASEOSA_PRICE);
    });

    it('subir el basePrice después del cobro no re-precia la línea; lo agregado sí sale al precio nuevo', async () => {
      // Decisión 2026-08-25: el catálogo de HOY solo rige para las líneas nuevas.
      const OLD_PRICE = 3000;
      const ADDED_OLD_PRICE = 2000;
      const ADDED_NEW_PRICE = 4000;
      const paidId = await mkProduct('Arepa D3', OLD_PRICE);
      const addedId = await mkProduct('Jugo D3', ADDED_OLD_PRICE, true);
      await request
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          entityType: 'PRODUCT',
          productId: addedId,
          delta: 10,
          type: 'INITIAL',
          notes: 'stock jugo D3',
        })
        .expect(201);

      const sale = await createPaidSale([{ productId: paidId, quantity: 1 }]);
      expect(sale.total).toBe(OLD_PRICE);

      // El dueño sube los precios del catálogo DESPUÉS del cobro.
      await request
        .patch(`/products/${paidId}`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ basePrice: 5000 })
        .expect(200);
      await request
        .patch(`/products/${addedId}`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ basePrice: ADDED_NEW_PRICE })
        .expect(200);

      const res = await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          items: [
            { productId: paidId, quantity: 1 },
            { productId: addedId, quantity: 1 },
          ],
        })
        .expect(200);

      expect(lineOf(res.body, paidId).unitPrice).toBe(OLD_PRICE);
      expect(lineOf(res.body, addedId).unitPrice).toBe(ADDED_NEW_PRICE);
      expect(res.body.total).toBe(OLD_PRICE + ADDED_NEW_PRICE);
    });

    it('cuenta abierta (PENDIENTE_PAGO): sí se re-precia, nada se cobró todavía', async () => {
      // Decisión 2026-08-25: el congelamiento es de lo COBRADO; una cuenta
      // abierta se sigue cotizando al catálogo vigente.
      const OLD_PRICE = 3000;
      const NEW_PRICE = 6000;
      const productId = await mkProduct('Sopa D3', OLD_PRICE);

      const tab = await request
        .post('/sales')
        .set('Authorization', `Bearer ${cajeroToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'COUNTER',
          openTab: true,
          customerName: 'Doña Ana',
          items: [{ productId, quantity: 1 }],
        })
        .expect(201);
      expect(tab.body.status).toBe('PENDIENTE_PAGO');
      expect(tab.body.total).toBe(OLD_PRICE);

      await request
        .patch(`/products/${productId}`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ basePrice: NEW_PRICE })
        .expect(200);

      const res = await request
        .patch(`/sales/${tab.body.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({
          items: [
            { productId, quantity: 1 },
            { productId: gaseosaId, quantity: 1 },
          ],
        })
        .expect(200);

      expect(lineOf(res.body, productId).unitPrice).toBe(NEW_PRICE);
      expect(res.body.total).toBe(NEW_PRICE + GASEOSA_PRICE);
    });
  });

  // ==================================================================
  // D4 — la edición nunca devuelve más stock del realmente descontado
  // ==================================================================
  describe('Reverso acotado a lo realmente descontado (D4)', () => {
    let insumoId: string;

    const insumoStock = async (): Promise<number> => {
      const agg = await prisma.inventoryMovement.aggregate({
        where: { ingredientId: insumoId },
        _sum: { delta: true },
      });
      return Number(agg._sum.delta ?? 0);
    };

    const mkPlato = async (name: string, gramos: number): Promise<string> => {
      const res = await request
        .post('/products')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          name,
          category: 'Comidas',
          basePrice: 8000,
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
      const productId = res.body.id as string;
      await request
        .put(`/products/${productId}/recipe`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ edges: [{ childType: 'ingredient', childId: insumoId, quantityNeta: gramos }] })
        .expect(200);
      return productId;
    };

    beforeAll(async () => {
      const ing = await request
        .post('/ingredients')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          name: 'Insumo D4',
          unitPurchase: 'kg',
          unitRecipe: 'g',
          conversionFactor: 1000,
        })
        .expect(201);
      insumoId = ing.body.id as string;
      await request
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          entityType: 'INGREDIENT',
          ingredientId: insumoId,
          delta: 10000,
          type: 'INITIAL',
          notes: 'stock inicial insumo D4',
        })
        .expect(201);
    });

    it('receta editada después del cobro: quitar la línea devuelve lo REALMENTE descontado', async () => {
      // Decisión 2026-08-25: el reverso sale de los movements de la venta, no
      // de la expansión de la receta vigente (el ledger es insert-only: un
      // gramo devuelto de más queda como fantasma permanente).
      const platoId = await mkPlato('Plato D4 receta cambiada', 100);
      const stockBeforePay = await insumoStock();

      const sale = await createPaidSale([
        { productId: platoId, quantity: 1 },
        { productId: gaseosaId, quantity: 1 },
      ]);
      expect(await insumoStock()).toBe(stockBeforePay - 100);

      // La receta sube a 120 g DESPUÉS del cobro (el pedido consumió 100).
      await request
        .put(`/products/${platoId}/recipe`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ edges: [{ childType: 'ingredient', childId: insumoId, quantityNeta: 120 }] })
        .expect(200);

      await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ items: [{ productId: gaseosaId, quantity: 1 }] })
        .expect(200);

      // Antes del fix devolvía 120 → +20 g que nunca se descontaron.
      expect(await insumoStock()).toBe(stockBeforePay);
      const ajuste = await prisma.inventoryMovement.findMany({
        where: { ingredientId: insumoId, sourceId: sale.id, notes: 'Ajuste por edición de pedido' },
      });
      expect(ajuste).toHaveLength(1);
      expect(Number(ajuste[0]!.delta)).toBe(100);
    });

    it('sin tocar la receta: quitar la línea devuelve exactamente lo consumido', async () => {
      // No-regresión del camino normal (receta intacta entre cobro y edición).
      const platoId = await mkPlato('Plato D4 receta intacta', 80);
      const stockBeforePay = await insumoStock();

      const sale = await createPaidSale([
        { productId: platoId, quantity: 1 },
        { productId: gaseosaId, quantity: 1 },
      ]);
      expect(await insumoStock()).toBe(stockBeforePay - 80);

      await request
        .patch(`/sales/${sale.id}/items`)
        .set('Authorization', `Bearer ${cajeroToken}`)
        .send({ items: [{ productId: gaseosaId, quantity: 1 }] })
        .expect(200);

      expect(await insumoStock()).toBe(stockBeforePay);
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
