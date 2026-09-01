/**
 * Los dos arreglos que salió a pedir la auditoría en producción del 2026-08-31.
 *
 * 1. **Nombres repetidos.** El catálogo aceptaba dos productos activos con el
 *    mismo nombre. En la caja quedaban dos fichas idénticas —una vendible y otra
 *    "AGOTADO"— y nada las distinguía: el cajero toca la equivocada y descuenta
 *    el stock del gemelo. Se probó contra producción: 201 y 201.
 *
 * 2. **Descuento manual de monto fijo.** Se aplicaba una vez por LÍNEA, así que
 *    "$500 sobre tres bebidas" cobraba $14.500 junto y $13.500 separado. Es el
 *    mismo bug que ya se había corregido en las promociones (§7.v54); el camino
 *    manual se había quedado atrás.
 *
 * Se prueba por HTTP porque el punto es lo que COBRA el servidor, que es la
 * autoridad — la aritmética pura ya está fijada en `reparto-invariante.test.ts`.
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Nombres únicos + descuento manual por unidad (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let token: string;
  let bebidaId: string;

  const PRECIO = 5_000;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-nombres@test.local',
          fullName: 'Dueño Nombres',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
      skipDuplicates: true,
    });
    token = await loginAs(request, 'dueno-nombres@test.local');

    const bebida = await request
      .post('/products')
      .set(auth())
      .send({
        name: 'Bebida Descuento',
        basePrice: PRECIO,
        category: 'Bebidas',
        directResale: true,
        unitPurchase: 'unidad',
        unitStock: 'unidad',
        conversionFactor: 1,
      })
      .expect(201);
    bebidaId = bebida.body.id;

    // Stock de sobra: el cobro valida existencias antes de descontar.
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({
        entityType: 'PRODUCT',
        productId: bebidaId,
        delta: 500,
        type: 'INITIAL',
        unitCost: 1_000,
        notes: 'Carga para la prueba',
      })
      .expect(201);

    await request.post('/shifts/open').set(auth()).send({ openingCash: 100_000 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ════════════════════════════════════════════════════════════════════
  describe('el catálogo no acepta dos nombres iguales entre lo activo', () => {
    it('rechaza un segundo producto con el mismo nombre', async () => {
      const res = await request
        .post('/products')
        .set(auth())
        .send({ name: 'Bebida Descuento', basePrice: 9_000, category: 'Bebidas' })
        .expect(409);
      expect(res.body.message).toMatch(/ya tienes un producto activo/i);
      // El mensaje es para una persona: sin código, sin nombre de tabla, sin uuid.
      expect(res.body.message).not.toMatch(/P2002|prisma|uq_|[0-9a-f]{8}-[0-9a-f]{4}/i);
    });

    it('tampoco si solo cambian las mayúsculas o los espacios', async () => {
      for (const name of ['bebida descuento', 'BEBIDA DESCUENTO', '  Bebida Descuento  ']) {
        await request
          .post('/products')
          .set(auth())
          .send({ name, basePrice: 9_000, category: 'Bebidas' })
          .expect(409);
      }
    });

    it('vale igual para insumos y subproductos', async () => {
      await request
        .post('/ingredients')
        .set(auth())
        .send({ name: 'Insumo Único', unitPurchase: 'caja', unitRecipe: 'unidad', conversionFactor: 10 })
        .expect(201);
      const ing = await request
        .post('/ingredients')
        .set(auth())
        .send({ name: 'insumo único', unitPurchase: 'caja', unitRecipe: 'unidad', conversionFactor: 10 })
        .expect(409);
      expect(ing.body.message).toMatch(/ya tienes un insumo activo/i);

      await request.post('/subproducts').set(auth()).send({ name: 'Sub Único', yield: 4 }).expect(201);
      const sub = await request
        .post('/subproducts')
        .set(auth())
        .send({ name: 'SUB ÚNICO', yield: 4 })
        .expect(409);
      expect(sub.body.message).toMatch(/ya tienes un subproducto activo/i);
    });

    it('renombrar algo hacia un nombre ya tomado también se rechaza', async () => {
      const otro = await request
        .post('/products')
        .set(auth())
        .send({ name: 'Producto Para Renombrar', basePrice: 1_000, category: 'Bebidas' })
        .expect(201);
      await request
        .patch(`/products/${otro.body.id}`)
        .set(auth())
        .send({ name: 'Bebida Descuento' })
        .expect(409);
    });

    it('guardar un producto SIN cambiarle el nombre sigue funcionando', async () => {
      // El chequeo tiene que eximir al propio item, o editar el precio sería imposible.
      await request
        .patch(`/products/${bebidaId}`)
        .set(auth())
        .send({ name: 'Bebida Descuento', basePrice: PRECIO })
        .expect(200);
    });

    it('desactivar libera el nombre, y reactivar vuelve a competir por él', async () => {
      const viejo = await request
        .post('/products')
        .set(auth())
        .send({ name: 'Nombre Reciclado', basePrice: 1_000, category: 'Bebidas' })
        .expect(201);

      await request.post(`/products/${viejo.body.id}/deactivate`).set(auth()).expect(201);

      // Con el primero dormido, el nombre queda libre.
      const nuevo = await request
        .post('/products')
        .set(auth())
        .send({ name: 'Nombre Reciclado', basePrice: 2_000, category: 'Bebidas' })
        .expect(201);
      expect(nuevo.body.id).not.toBe(viejo.body.id);

      // Y revivir al viejo ahora chocaría con el que ocupó su lugar.
      await request
        .patch(`/products/${viejo.body.id}`)
        .set(auth())
        .send({ isActive: true })
        .expect(409);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  describe('el descuento manual de monto fijo es POR CADA UNIDAD', () => {
    const vender = async (items: unknown[], extra: Record<string, unknown> = {}) => {
      const res = await request
        .post('/sales')
        .set({ ...auth(), 'Idempotency-Key': randomUUID() })
        .send({ type: 'COUNTER', items, ...extra })
        .expect(201);
      return res.body;
    };

    it('tres unidades en UNA línea descuentan $500 por cada una', async () => {
      const v = await vender(
        [{ productId: bebidaId, quantity: 3, manualDiscount: { kind: 'FIXED', value: 500 } }],
        { discountReason: 'prueba por unidad' },
      );
      expect(Number(v.subtotal)).toBe(15_000);
      expect(Number(v.discountTotal)).toBe(1_500);
      expect(Number(v.total)).toBe(13_500);
    });

    it('la misma compra cuesta lo mismo repartida en tres líneas', async () => {
      const juntas = await vender(
        [{ productId: bebidaId, quantity: 3, manualDiscount: { kind: 'FIXED', value: 500 } }],
        { discountReason: 'prueba reparto' },
      );
      const sueltas = await vender(
        ['a', 'b', 'c'].map((n) => ({
          productId: bebidaId,
          quantity: 1,
          notes: n,
          manualDiscount: { kind: 'FIXED', value: 500 },
        })),
        { discountReason: 'prueba reparto' },
      );
      expect(Number(sueltas.total)).toBe(Number(juntas.total));
      expect(Number(sueltas.discountTotal)).toBe(Number(juntas.discountTotal));
    });

    it('nunca descuenta más que la línea', async () => {
      const v = await vender(
        [{ productId: bebidaId, quantity: 2, manualDiscount: { kind: 'FIXED', value: 9_000 } }],
        { discountReason: 'tope' },
      );
      expect(Number(v.discountTotal)).toBe(10_000); // el subtotal entero, no más
      expect(Number(v.total)).toBe(0);
    });

    it('el porcentaje no se multiplica por la cantidad', async () => {
      const v = await vender(
        [{ productId: bebidaId, quantity: 3, manualDiscount: { kind: 'PERCENT', value: 10 } }],
        { discountReason: 'porcentaje' },
      );
      expect(Number(v.discountTotal)).toBe(1_500); // 10% de $15.000
    });

    it('el descuento sobre el TOTAL sigue siendo uno solo, no por unidad', async () => {
      const v = await vender([{ productId: bebidaId, quantity: 3 }], {
        orderDiscount: { kind: 'FIXED', value: 500 },
        discountReason: 'sobre el total',
      });
      expect(Number(v.orderDiscountAmount)).toBe(500);
      expect(Number(v.total)).toBe(14_500);
    });

    it('editar un pedido cobrado recalcula con la misma regla', async () => {
      const v = await vender(
        [{ productId: bebidaId, quantity: 1, manualDiscount: { kind: 'FIXED', value: 500 } }],
        { discountReason: 'edición' },
      );
      await request
        .post(`/sales/${v.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: Number(v.total) })
        .expect(201);

      const editada = await request
        .patch(`/sales/${v.id}/items`)
        .set(auth())
        .send({
          items: [{ productId: bebidaId, quantity: 4, manualDiscount: { kind: 'FIXED', value: 500 } }],
          discountReason: 'edición',
        })
        .expect(200);
      // 4 unidades × $500 = $2.000, no $500.
      expect(Number(editada.body.discountTotal)).toBe(2_000);
      expect(Number(editada.body.total)).toBe(18_000);
    });
  });
});
