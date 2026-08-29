/**
 * Race del confirm de facturas: `POST /invoices/:id/confirm` lee el status FUERA
 * de la tx y no tenía idempotency key, así que un doble-click / auto-retry podía
 * pasar el check DOS veces y escribir los `PURCHASE` movements duplicados
 * (inventory_movements es insert-only → stock doble-contado + lastUnitCost
 * doble-aplicado + lotes fantasma en el FIFO). El fix añade un claim atómico
 * (`updateMany WHERE status=PENDING_REVIEW`) dentro de la tx. Este e2e lo ejerce:
 * dos confirms EN PARALELO → exactamente uno gana y el inventario se escribe UNA
 * sola vez. El servidor ya escucha (`bootstrapApp`), que es lo que permite concurrencia real.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const QUANTITY = 5; // kg
const CONVERSION = 1000; // g por kg → 5000 g de stock esperado
const UNIT_PRICE = 10000;
const TOTAL = 50000;

describe('Race confirm de factura vs confirm concurrente E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let userId: string;
  let ingredientId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    request = supertest(app.getHttpServer());

    const hash = await bcrypt.hash('dev12345', 10);
    const dueno = await prisma.user.create({
      data: { email: 'dueno-invconc@test.local', fullName: 'Dueño InvConc', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    userId = dueno.id;
    token = await loginAs(request, 'dueno-invconc@test.local');

    const ing = await request
      .post('/ingredients')
      .set(auth())
      .send({ name: 'Harina Conc', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: CONVERSION, thresholdMin: 0, isActive: true })
      .expect(201);
    ingredientId = ing.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('dos confirms en paralelo → uno gana, el inventario se escribe UNA sola vez', async () => {
    const draft = await prisma.invoice.create({
      data: {
        status: 'PENDING_REVIEW',
        aiModelUsed: 'test-mock',
        aiExtractionJson: { supplierName: 'Prov Conc', supplierNit: '900999888-1', invoiceNumber: 'FC-1', total: TOTAL, iva: null, items: [], warnings: [] },
        uploadedById: userId,
      },
    });

    const body = {
      supplierNit: '900999888-1',
      supplierName: 'Prov Conc',
      invoiceNumber: 'FC-1',
      total: TOTAL,
      items: [
        { entityType: 'INGREDIENT', ingredientId, descriptionRaw: 'Harina Conc', quantity: QUANTITY, unit: 'kg', unitPrice: UNIT_PRICE, total: TOTAL },
      ],
    };

    // Dos confirms JUNTOS (doble-click / auto-retry sin idempotency key).
    const results = await Promise.all([
      request.post(`/invoices/${draft.id}/confirm`).set(auth()).send(body),
      request.post(`/invoices/${draft.id}/confirm`).set(auth()).send(body),
    ]);

    const ok = results.filter((r) => r.status === 200 || r.status === 201);
    const rejected = results.filter((r) => r.status === 400);
    // Exactamente uno confirma; el otro es rechazado por el claim. Nunca ambos.
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // El inventario se escribió UNA sola vez: un único PURCHASE movement y el
    // stock = 5000 g (no 10000 por doble conteo).
    const movements = await prisma.inventoryMovement.findMany({
      where: { entityType: 'INGREDIENT', ingredientId, type: 'PURCHASE' },
    });
    expect(movements).toHaveLength(1);
    const stock = await prisma.inventoryMovement.aggregate({
      where: { entityType: 'INGREDIENT', ingredientId },
      _sum: { delta: true },
    });
    expect(Number(stock._sum.delta ?? 0)).toBe(QUANTITY * CONVERSION);

    // La factura quedó CONFIRMED una sola vez.
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } });
    expect(invoice.status).toBe('CONFIRMED');
  });
});
