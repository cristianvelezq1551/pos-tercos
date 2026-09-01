/**
 * Un descuento de MONTO FIJO se aplica por UNIDAD, y el servidor —que es quien
 * cobra— tiene que llegar al mismo total que muestra la caja, sin importar en
 * cuántas líneas quedó repartida la misma cantidad.
 *
 * Antes se descontaba una vez por LÍNEA ignorando la cantidad: tres
 * hamburguesas en una línea pagaban −$2.000 y en tres líneas —porque cada una
 * lleva su nota— pagaban −$6.000. La misma compra a dos precios, decidido por
 * cómo la tecleó el cajero.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Descuento de monto fijo por unidad E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let productId: string;

  const PRECIO = 10_000;
  const DESCUENTO = 2_000;

  const vender = async (items: Array<{ quantity: number; notes?: string }>) => {
    const res = await request
      .post('/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'COUNTER',
        items: items.map((it) => ({ productId, quantity: it.quantity, notes: it.notes })),
      })
      .expect(201);
    return res.body as { total: number; discountTotal: number };
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    await prisma.user.create({
      data: {
        email: 'dueno-fijo@test.local',
        fullName: 'Dueño Fijo',
        role: 'DUENO',
        passwordHash: await bcrypt.hash('dev12345', 10),
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-fijo@test.local');
    await prisma.productCategory.upsert({
      where: { name: 'Burgers' },
      update: {},
      create: { name: 'Burgers' },
    });

    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Hamburguesa Fija',
        category: 'Burgers',
        basePrice: PRECIO,
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
      .send({ entityType: 'PRODUCT', productId, delta: 100, type: 'INITIAL', notes: 'stock' })
      .expect(201);

    await request
      .post('/promotions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '$2.000 en hamburguesas',
        type: 'FIXED_OFF',
        discountFixed: DESCUENTO,
        daysOfWeekMask: 127,
        timeStart: '00:00:00',
        timeEnd: '23:59:59',
        productIds: [productId],
      })
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

  it('el descuento es por unidad: tres hamburguesas, $6.000', async () => {
    const venta = await vender([{ quantity: 3 }]);
    expect(venta.discountTotal).toBe(DESCUENTO * 3);
    expect(venta.total).toBe(PRECIO * 3 - DESCUENTO * 3);
  });

  it('el total NO cambia si las tres van en líneas separadas', async () => {
    const juntas = await vender([{ quantity: 3 }]);
    const separadas = await vender([
      { quantity: 1, notes: 'sin cebolla' },
      { quantity: 1, notes: 'sin salsa' },
      { quantity: 1 },
    ]);
    expect(separadas.total).toBe(juntas.total);
    expect(separadas.discountTotal).toBe(juntas.discountTotal);
  });

  it('nunca descuenta más que el precio del producto', async () => {
    await request
      .post('/promotions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'descuento gigante',
        type: 'FIXED_OFF',
        discountFixed: 99_000,
        daysOfWeekMask: 127,
        timeStart: '00:00:00',
        timeEnd: '23:59:59',
        productIds: [productId],
      })
      .expect(201);

    const venta = await vender([{ quantity: 2 }]);
    expect(venta.total).toBe(0);
    expect(venta.discountTotal).toBe(PRECIO * 2);
  });
});
