/**
 * E2E de concurrencia del cobro: confirmar varias ventas EN PARALELO en la
 * misma caja debe producir turnos DISTINTOS (1..N), nunca duplicados. Valida el
 * índice único (shift_id, turn_number) + el retry `runWithTurnRetry`.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Cobro concurrente — unicidad de turno E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let prodId: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Servidor escuchando real: supertest contra un server ya en `listen`
    // permite requests CONCURRENTES (el ephemeral per-request colisiona).
    await app.listen(0);
    request = supertest(app.getHttpServer());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-conc@test.local',
        fullName: 'Dueño Conc',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-conc@test.local');

    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Gaseosa Conc',
        basePrice: 4000,
        directResale: true,
        unitPurchase: 'caja',
        unitStock: 'unit',
        conversionFactor: 100,
        modifiersEnabled: false,
      })
      .expect(201);
    prodId = prod.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ entityType: 'PRODUCT', productId: prodId, delta: 500, type: 'INITIAL', unitCost: 1000 })
      .expect(201);
    await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ openingCash: 0 })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const createSale = async (): Promise<string> => {
    const res = await request
      .post('/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: prodId, quantity: 1 }] })
      .expect(201);
    return res.body.id as string;
  };

  it('N confirmaciones en paralelo → turnos distintos 1..N, sin duplicados', async () => {
    const N = 8;
    const saleIds = await Promise.all(Array.from({ length: N }, () => createSale()));

    const results = await Promise.all(
      saleIds.map((id) =>
        request
          .post(`/sales/${id}/confirm-payment`)
          .set('Authorization', `Bearer ${token}`)
          .send({ method: 'CASH', amountReceived: 4000 }),
      ),
    );

    for (const r of results) expect([200, 201]).toContain(r.status);
    const turns = results.map((r) => r.body.turnNumber as number).sort((a, b) => a - b);
    expect(turns).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    // Sin duplicados (lo garantiza el índice único + retry).
    expect(new Set(turns).size).toBe(N);
  });

  it('dos cobros del MISMO stock escaso → exactamente uno gana, sin stock negativo', async () => {
    // Producto reventa directa con stock = 1 (alcanza para UNA sola venta).
    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Escaso Conc',
        basePrice: 5000,
        directResale: true,
        unitPurchase: 'unidad',
        unitStock: 'unidad',
        conversionFactor: 1,
        modifiersEnabled: false,
      })
      .expect(201);
    const escasoId = prod.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ entityType: 'PRODUCT', productId: escasoId, delta: 1, type: 'INITIAL', unitCost: 1000 })
      .expect(201);

    // Dos ventas PENDIENTE_PAGO del mismo producto (el stock se descuenta al cobrar).
    const ids = await Promise.all(
      [0, 1].map(async () => {
        const r = await request
          .post('/sales')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', randomUUID())
          .send({ type: 'COUNTER', items: [{ productId: escasoId, quantity: 1 }] })
          .expect(201);
        return r.body.id as string;
      }),
    );

    // Cobrar las DOS en paralelo: solo hay stock para una.
    const results = await Promise.all(
      ids.map((id) =>
        request
          .post(`/sales/${id}/confirm-payment`)
          .set('Authorization', `Bearer ${token}`)
          .send({ method: 'CASH', amountReceived: 5000 }),
      ),
    );

    const ok = results.filter((r) => r.status === 200 || r.status === 201);
    const conflict = results.filter((r) => r.status === 409);
    // Exactamente uno cobra; el otro recibe 409 (stock insuficiente). Nunca ambos.
    expect(ok).toHaveLength(1);
    expect(conflict).toHaveLength(1);

    // Stock final = 0 (jamás negativo).
    const stock = await prisma.inventoryMovement.aggregate({
      where: { entityType: 'PRODUCT', productId: escasoId },
      _sum: { delta: true },
    });
    expect(Number(stock._sum.delta ?? 0)).toBe(0);
  });
});
