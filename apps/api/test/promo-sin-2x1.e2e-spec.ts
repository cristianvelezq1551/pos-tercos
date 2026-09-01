/**
 * El 2x1 no se puede crear (decisión del dueño, 2026-08-31).
 *
 * El motor lo calcula POR LÍNEA, y una unidad con indicación —"sin cebolla"—
 * va en su propia línea: el descuento no se aplicaría y el cliente pagaría de
 * más sin que nadie lo note. Quitarlo del formulario no alcanza: el servidor
 * tiene que rechazarlo igual, porque la pantalla no es la frontera.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Sin promociones 2x1 E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let productId: string;

  const base = {
    daysOfWeekMask: 127,
    timeStart: '00:00:00',
    timeEnd: '23:59:59',
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    await prisma.user.create({
      data: {
        email: 'dueno-sin2x1@test.local',
        fullName: 'Dueño Sin 2x1',
        role: 'DUENO',
        passwordHash: await bcrypt.hash('dev12345', 10),
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-sin2x1@test.local');
    await prisma.productCategory.upsert({
      where: { name: 'Bebidas' },
      update: {},
      create: { name: 'Bebidas' },
    });
    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Gaseosa Sin2x1',
        category: 'Bebidas',
        basePrice: 5000,
        directResale: true,
        unitPurchase: 'unidad',
        unitStock: 'unidad',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    productId = prod.body.id;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('el servidor rechaza crear un 2x1, aunque no pase por el formulario', async () => {
    const res = await request
      .post('/promotions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '2x1 en gaseosas',
        type: 'BOGO',
        bogoBuyQty: 1,
        bogoGetQty: 1,
        productIds: [productId],
        ...base,
      })
      .expect(400);

    const mensaje = JSON.stringify(res.body.message ?? res.body);
    expect(mensaje).toMatch(/deshabilitadas/);
    // Le habla a una persona: nada de nombres de enum en pantalla.
    expect(mensaje).not.toMatch(/BOGO/);
  });

  it('los tipos que SÍ se pueden crear siguen funcionando', async () => {
    for (const promo of [
      { name: '20% gaseosas', type: 'PERCENT_OFF', discountPct: 0.2 },
      { name: '$1.000 gaseosas', type: 'FIXED_OFF', discountFixed: 1000 },
    ]) {
      await request
        .post('/promotions')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...promo, productIds: [productId], ...base })
        .expect(201);
    }
  });

  it('no queda ninguna promoción de 2x1 creada', async () => {
    const promos = await prisma.promotion.findMany({ where: { type: 'BOGO' } });
    expect(promos).toHaveLength(0);
  });
});
