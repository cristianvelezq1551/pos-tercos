/**
 * E2E de dos capacidades nuevas del motor de promociones (2026-09-21):
 *
 *  - Promo limitada a VARIANTES: "Papas TERCOS" tiene tres tamaños y el dueño
 *    quería la promo SOLO en "Pollo y Miel ahumada"; una promo por producto se
 *    la daba a las tres.
 *  - PRECIO FIJO: "el Sándwich a $22.000" mientras dura la promo, sin importar
 *    su precio de carta. Es el precio del producto con su tamaño; los extras se
 *    suman encima; si el producto ya es más barato, no aplica.
 *
 * Y la regresión que importa: una promo de siempre (producto entero, %) cobra
 * exactamente igual.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const PRECIO_SANDWICH = 27_000;
const PRECIO_PAPAS = 25_000;
const CARNE_EXTRA = 3_000;
const QUESO = 3_000;

describe('Promos por variante y de precio fijo E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let dueno: string;
  let cajero: string;
  let sandwichId: string;
  let quesoId: string;
  let papasId: string;
  let polloId: string;
  let carneId: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const vender = async (
    items: Array<{ productId: string; quantity: number; sizeId?: string; modifiers?: Array<{ modifierId: string }> }>,
  ) => {
    const creada = await request
      .post('/sales')
      .set(auth(cajero))
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items })
      .expect(201);
    await request
      .post(`/sales/${creada.body.id}/confirm-payment`)
      .set(auth(cajero))
      .send({ method: 'CASH', amountReceived: Math.max(creada.body.total, 1) })
      .expect(201);
    return creada.body as {
      id: string;
      total: number;
      discountTotal: number;
      items: Array<{ productId: string; sizeId: string | null; lineDiscount: number; lineTotal: number; appliedPromotionId: string | null }>;
    };
  };
  const promo = async (body: Record<string, unknown>) => {
    const res = await request
      .post('/promotions')
      .set(auth(dueno))
      .send({ daysOfWeekMask: 127, timeStart: '00:00:00', timeEnd: '23:59:59', channel: 'BOTH', ...body })
      .expect(201);
    return res.body as { id: string; productIds: string[]; sizeIdsByProduct?: Record<string, string[]>; fixedPrice: number | null };
  };
  const apagar = (id: string) => request.delete(`/promotions/${id}`).set(auth(dueno)).expect(200);

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-promo-var@test.local', fullName: 'Dueño', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-promo-var@test.local', fullName: 'Cajero', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    dueno = await loginAs(request, 'dueno-promo-var@test.local');
    cajero = await loginAs(request, 'cajero-promo-var@test.local');

    const reventa = { directResale: true, unitPurchase: 'caja', unitStock: 'unit', conversionFactor: 12, category: 'Test' };
    const sandwich = await request
      .post('/products')
      .set(auth(dueno))
      .send({ ...reventa, name: 'Sandwich Promo', basePrice: PRECIO_SANDWICH, modifiersEnabled: true, modifiers: [{ name: 'Queso extra', priceDelta: QUESO }] })
      .expect(201);
    sandwichId = sandwich.body.id;
    quesoId = sandwich.body.modifiers[0].id;
    const papas = await request
      .post('/products')
      .set(auth(dueno))
      .send({
        ...reventa,
        name: 'Papas Promo',
        basePrice: PRECIO_PAPAS,
        modifiersEnabled: false,
        sizes: [
          { name: 'Pollo y Miel', priceModifier: 0, sortOrder: 0 },
          { name: 'Carne smash', priceModifier: CARNE_EXTRA, sortOrder: 1 },
        ],
      })
      .expect(201);
    papasId = papas.body.id;
    polloId = papas.body.sizes.find((s: { name: string }) => s.name === 'Pollo y Miel').id;
    carneId = papas.body.sizes.find((s: { name: string }) => s.name === 'Carne smash').id;
    for (const pid of [sandwichId, papasId]) {
      await request
        .post('/inventory/movements')
        .set(auth(dueno))
        .send({ type: 'INITIAL', entityType: 'PRODUCT', productId: pid, delta: 500, unitCost: 5000 })
        .expect(201);
    }
    await request.post('/shifts/open').set(auth(cajero)).send({ openingCash: 50_000 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('promo limitada a una variante', () => {
    let promoId: string;
    beforeAll(async () => {
      const p = await promo({
        name: '20% en Sandwich y Papas de Pollo',
        type: 'PERCENT_OFF',
        discountPct: 0.2,
        productIds: [sandwichId, papasId],
        sizeIdsByProduct: { [papasId]: [polloId] },
      });
      promoId = p.id;
      expect(p.sizeIdsByProduct).toEqual({ [papasId]: [polloId] });
      expect(p.productIds.sort()).toEqual([sandwichId, papasId].sort());
    });
    afterAll(async () => apagar(promoId));

    it('descuenta la variante limitada, deja la otra en precio lleno y el producto sin tamaños entero', async () => {
      const v = await vender([
        { productId: papasId, quantity: 1, sizeId: polloId },
        { productId: papasId, quantity: 1, sizeId: carneId },
        { productId: sandwichId, quantity: 1 },
      ]);
      const pollo = v.items.find((i) => i.sizeId === polloId)!;
      const carne = v.items.find((i) => i.sizeId === carneId)!;
      const sand = v.items.find((i) => i.productId === sandwichId)!;
      expect(pollo.lineDiscount).toBe(PRECIO_PAPAS * 0.2);
      expect(pollo.appliedPromotionId).toBe(promoId);
      expect(carne.lineDiscount).toBe(0);
      expect(carne.appliedPromotionId).toBeNull();
      expect(sand.lineDiscount).toBe(PRECIO_SANDWICH * 0.2);
      expect(v.total).toBe(PRECIO_PAPAS * 0.8 + (PRECIO_PAPAS + CARNE_EXTRA) + PRECIO_SANDWICH * 0.8);
    });

    it('la web muestra la limitación (subset SAFE) y el pedido web la respeta', async () => {
      const menu = await request.get('/web/menu').expect(200);
      const enMenu = (menu.body.promotions as Array<{ id: string; sizeIdsByProduct?: Record<string, string[]> }>).find((p) => p.id === promoId);
      expect(enMenu?.sizeIdsByProduct).toEqual({ [papasId]: [polloId] });
      const pedido = await request
        .post('/web/orders')
        .send({
          type: 'WEB_PICKUP',
          items: [
            { productId: papasId, quantity: 1, sizeId: carneId },
            { productId: papasId, quantity: 1, sizeId: polloId },
          ],
          customerName: 'Cliente Variante',
          customerPhone: '+573001110001',
        })
        .expect(201);
      expect(pedido.body.order.discountTotal).toBe(PRECIO_PAPAS * 0.2);
    });

    it('editarla cambia la variante, y mandar solo productos vuelve a "todas las variantes"', async () => {
      await request
        .patch(`/promotions/${promoId}`)
        .set(auth(dueno))
        .send({ productIds: [sandwichId, papasId], sizeIdsByProduct: { [papasId]: [carneId] } })
        .expect(200);
      const v1 = await vender([{ productId: papasId, quantity: 1, sizeId: polloId }, { productId: papasId, quantity: 1, sizeId: carneId }]);
      expect(v1.items.find((i) => i.sizeId === polloId)!.lineDiscount).toBe(0);
      expect(v1.items.find((i) => i.sizeId === carneId)!.lineDiscount).toBe((PRECIO_PAPAS + CARNE_EXTRA) * 0.2);

      const sinLimite = await request.patch(`/promotions/${promoId}`).set(auth(dueno)).send({ productIds: [sandwichId, papasId] }).expect(200);
      expect(sinLimite.body.sizeIdsByProduct).toBeUndefined();
      const v2 = await vender([{ productId: papasId, quantity: 1, sizeId: polloId }]);
      expect(v2.items[0].lineDiscount).toBe(PRECIO_PAPAS * 0.2);
      // Se restaura la limitación para los casos que siguen.
      await request
        .patch(`/promotions/${promoId}`)
        .set(auth(dueno))
        .send({ productIds: [sandwichId, papasId], sizeIdsByProduct: { [papasId]: [polloId] } })
        .expect(200);
    });

    it('rechaza una variante que no es del producto, con un mensaje para una persona', async () => {
      const res = await request
        .post('/promotions')
        .set(auth(dueno))
        .send({
          name: 'Mal armada',
          type: 'PERCENT_OFF',
          discountPct: 0.1,
          daysOfWeekMask: 127,
          timeStart: '00:00:00',
          timeEnd: '23:59:59',
          productIds: [sandwichId],
          sizeIdsByProduct: { [sandwichId]: [polloId] },
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/variantes/i);
      expect(JSON.stringify(res.body)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    });

    it('no deja eliminar el tamaño que la promo está usando, y dice cuál promo', async () => {
      // Un producto aparte, sin ventas: si el tamaño ya se vendió gana el otro
      // guard ("con ventas registradas") y no se vería el de la promo.
      const otro = await request
        .post('/products')
        .set(auth(dueno))
        .send({
          directResale: true, unitPurchase: 'caja', unitStock: 'unit', conversionFactor: 12, category: 'Test',
          name: 'Papas Promo Dos', basePrice: PRECIO_PAPAS, modifiersEnabled: false,
          sizes: [{ name: 'Chica', priceModifier: 0, sortOrder: 0 }, { name: 'Grande', priceModifier: 2000, sortOrder: 1 }],
        })
        .expect(201);
      const otroId = otro.body.id as string;
      const chicaId = otro.body.sizes.find((s: { name: string }) => s.name === 'Chica').id as string;
      const grandeId = otro.body.sizes.find((s: { name: string }) => s.name === 'Grande').id as string;
      const p = await promo({ name: 'Solo Chica', type: 'PERCENT_OFF', discountPct: 0.1, productIds: [otroId], sizeIdsByProduct: { [otroId]: [chicaId] } });
      try {
        const res = await request
          .put(`/products/${otroId}/options`)
          .set(auth(dueno))
          .send({ sizes: [{ id: grandeId, name: 'Grande', priceModifier: 2000, sortOrder: 0 }], modifiers: [] })
          .expect(400);
        expect(res.body.message).toMatch(/Solo Chica/);
        expect(res.body.message).toMatch(/Chica/);
        expect(res.body.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
        // Y el tamaño sigue ahí.
        const prod = await request.get(`/products/${otroId}`).set(auth(dueno)).expect(200);
        expect(prod.body.sizes.map((s: { id: string }) => s.id).sort()).toEqual([chicaId, grandeId].sort());
      } finally {
        await apagar(p.id);
      }
    });
  });

  describe('precio fijo', () => {
    it('vende el producto al precio fijo, por unidad', async () => {
      const p = await promo({ name: 'Sandwich a 22', type: 'FIXED_PRICE', fixedPrice: 22_000, productIds: [sandwichId] });
      expect(p.fixedPrice).toBe(22_000);
      try {
        const v = await vender([{ productId: sandwichId, quantity: 2 }]);
        expect(v.items[0].appliedPromotionId).toBe(p.id);
        expect(v.discountTotal).toBe((PRECIO_SANDWICH - 22_000) * 2);
        expect(v.total).toBe(22_000 * 2);
      } finally {
        await apagar(p.id);
      }
    });

    it('los extras se cobran encima del precio fijo', async () => {
      const p = await promo({ name: 'Sandwich a 22 con extras', type: 'FIXED_PRICE', fixedPrice: 22_000, productIds: [sandwichId] });
      try {
        const v = await vender([{ productId: sandwichId, quantity: 1, modifiers: [{ modifierId: quesoId }] }]);
        // 27.000 + 3.000 de queso = 30.000; paga 22.000 + 3.000 = 25.000.
        expect(v.discountTotal).toBe(PRECIO_SANDWICH - 22_000);
        expect(v.total).toBe(22_000 + QUESO);
      } finally {
        await apagar(p.id);
      }
    });

    it('un precio fijo MAYOR al precio del producto no aplica: nunca sube el precio', async () => {
      const p = await promo({ name: 'Sandwich a 30', type: 'FIXED_PRICE', fixedPrice: 30_000, productIds: [sandwichId] });
      try {
        const v = await vender([{ productId: sandwichId, quantity: 1 }]);
        expect(v.discountTotal).toBe(0);
        expect(v.total).toBe(PRECIO_SANDWICH);
        expect(v.items[0].appliedPromotionId).toBeNull();
      } finally {
        await apagar(p.id);
      }
    });

    it('precio fijo por variante: Papas de Pollo a $20.000 y la de carne en precio lleno', async () => {
      const p = await promo({
        name: 'Papas de Pollo a 20',
        type: 'FIXED_PRICE',
        fixedPrice: 20_000,
        productIds: [papasId],
        sizeIdsByProduct: { [papasId]: [polloId] },
      });
      try {
        const v = await vender([
          { productId: papasId, quantity: 1, sizeId: polloId },
          { productId: papasId, quantity: 1, sizeId: carneId },
        ]);
        expect(v.items.find((i) => i.sizeId === polloId)!.lineTotal).toBe(20_000);
        expect(v.items.find((i) => i.sizeId === carneId)!.lineTotal).toBe(PRECIO_PAPAS + CARNE_EXTRA);
      } finally {
        await apagar(p.id);
      }
    });

    it('gana la de mayor descuento en pesos y no se acumulan', async () => {
      const pct = await promo({ name: '10% sandwich', type: 'PERCENT_OFF', discountPct: 0.1, productIds: [sandwichId] });
      const fijo = await promo({ name: 'Sandwich a 22 compite', type: 'FIXED_PRICE', fixedPrice: 22_000, productIds: [sandwichId] });
      try {
        const v = await vender([{ productId: sandwichId, quantity: 1 }]);
        // 10% = 2.700 · precio fijo = 5.000 → gana el precio fijo, solo él.
        expect(v.items[0].appliedPromotionId).toBe(fijo.id);
        expect(v.discountTotal).toBe(5_000);
      } finally {
        await apagar(pct.id);
        await apagar(fijo.id);
      }
    });

    it('la web recibe el precio fijo y el pedido web paga el precio fijo', async () => {
      const p = await promo({ name: 'Sandwich a 22 web', type: 'FIXED_PRICE', fixedPrice: 22_000, productIds: [sandwichId] });
      try {
        // `/web/menu` se cachea 30 s (MENU_TTL_MS) y otro caso ya lo pidió: el
        // DTO se verifica por la promo; el pedido web recalcula contra la base.
        const dto = await request.get(`/promotions/${p.id}`).set(auth(dueno)).expect(200);
        expect(dto.body.fixedPrice).toBe(22_000);
        const pedido = await request
          .post('/web/orders')
          .send({ type: 'WEB_PICKUP', items: [{ productId: sandwichId, quantity: 1 }], customerName: 'Cliente Fijo', customerPhone: '+573001110002' })
          .expect(201);
        expect(pedido.body.order.total).toBe(22_000);
      } finally {
        await apagar(p.id);
      }
    });

    it('REGRESIÓN: una promo de siempre (producto entero, %) cobra exactamente igual', async () => {
      const p = await promo({ name: 'Clásica 15%', type: 'PERCENT_OFF', discountPct: 0.15, productIds: [papasId] });
      try {
        const v = await vender([{ productId: papasId, quantity: 2, sizeId: carneId }]);
        expect(v.discountTotal).toBe((PRECIO_PAPAS + CARNE_EXTRA) * 2 * 0.15);
        expect(p.sizeIdsByProduct).toBeUndefined();
      } finally {
        await apagar(p.id);
      }
    });
  });
});
