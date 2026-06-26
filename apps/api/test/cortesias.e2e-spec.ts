/**
 * cortesias.e2e-spec.ts
 *
 * Cortesías (producto regalado): el cajero la SOLICITA (queda PENDING, sin tocar
 * stock); un admin/dueño la APRUEBA (recién ahí se descuenta stock a costo FIFO)
 * o la RECHAZA (no toca stock). Cubre la máquina de estados, el efecto sobre el
 * inventario y el guard anti-doble-aprobación (TOCTOU).
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Cortesías E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;
  let productId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createCortesia = async (quantity: number, reason: string) => {
    const res = await request
      .post('/cortesias')
      .set(auth(cajeroToken))
      .send({ productId, quantity, reason })
      .expect(201);
    return res.body.id as string;
  };

  const movementsForCortesia = (cortesiaId: string) =>
    prisma.inventoryMovement.findMany({ where: { sourceType: 'cortesia', sourceId: cortesiaId } });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-cortesias@test.local', fullName: 'Dueño Cortesías', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-cortesias@test.local', fullName: 'Cajero Cortesías', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-cortesias@test.local');
    cajeroToken = await loginAs(request, 'cajero-cortesias@test.local');

    // Producto de reventa directa: una cortesía consume el producto mismo.
    const prod = await request
      .post('/products')
      .set(auth(duenoToken))
      .send({
        name: 'Gaseosa Cortesía Test',
        category: 'Bebidas',
        basePrice: 4_000,
        isActive: true,
        directResale: true,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'caja',
        unitStock: 'unidad',
        conversionFactor: 24,
        thresholdMin: 0,
      })
      .expect(201);
    productId = prod.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('solicitar deja la cortesía en PENDING sin descontar stock', async () => {
    const id = await createCortesia(2, 'Cliente frecuente');
    const list = await request.get('/cortesias?status=PENDING').set(auth(duenoToken)).expect(200);
    const found = (list.body as Array<{ id: string; status: string }>).find((c) => c.id === id);
    expect(found?.status).toBe('PENDING');
    expect(await movementsForCortesia(id)).toHaveLength(0); // aún no toca stock
  });

  it('un rol no-admin no puede aprobar (403)', async () => {
    const id = await createCortesia(1, 'Prueba de rol');
    await request.post(`/cortesias/${id}/approve`).set(auth(cajeroToken)).send({}).expect(403);
  });

  it('aprobar descuenta stock del producto (movement negativo, sourceType cortesia)', async () => {
    const id = await createCortesia(3, 'Regalo de inauguración');
    const res = await request.post(`/cortesias/${id}/approve`).set(auth(duenoToken)).send({}).expect(201);
    expect(res.body.status).toBe('APPROVED');

    const movements = await movementsForCortesia(id);
    expect(movements).toHaveLength(1);
    expect(movements[0]!.productId).toBe(productId);
    expect(Number(movements[0]!.delta)).toBe(-3); // 3 unidades consumidas
  });

  it('rechazar NO toca stock', async () => {
    const id = await createCortesia(2, 'No autorizada');
    const res = await request.post(`/cortesias/${id}/reject`).set(auth(duenoToken)).send({}).expect(201);
    expect(res.body.status).toBe('REJECTED');
    expect(await movementsForCortesia(id)).toHaveLength(0);
  });

  it('no se puede aprobar dos veces (guard anti-doble-descuento)', async () => {
    const id = await createCortesia(1, 'Doble aprobación');
    await request.post(`/cortesias/${id}/approve`).set(auth(duenoToken)).send({}).expect(201);
    await request.post(`/cortesias/${id}/approve`).set(auth(duenoToken)).send({}).expect(400);
    expect(await movementsForCortesia(id)).toHaveLength(1); // solo un descuento
  });

  it('no se puede rechazar una cortesía ya aprobada', async () => {
    const id = await createCortesia(1, 'Aprobar y luego rechazar');
    await request.post(`/cortesias/${id}/approve`).set(auth(duenoToken)).send({}).expect(201);
    await request.post(`/cortesias/${id}/reject`).set(auth(duenoToken)).send({}).expect(400);
  });

  it('la DB rechaza un status fuera del enum (garantía nativa, no solo la app)', async () => {
    const id = await createCortesia(1, 'Estado inválido');
    await expect(
      prisma.$executeRawUnsafe(`UPDATE cortesia_requests SET status = 'INVALIDO' WHERE id = '${id}'`),
    ).rejects.toThrow();
  });

  it('el resumen del mes cuenta las cortesías aprobadas', async () => {
    const now = new Date();
    const res = await request
      .get(`/cortesias/given-summary?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .set(auth(duenoToken))
      .expect(200);
    // Aprobamos varias arriba (qty 3 + 1 + 1) → al menos 3 cortesías aprobadas.
    expect(res.body.count).toBeGreaterThanOrEqual(3);
  });
});
