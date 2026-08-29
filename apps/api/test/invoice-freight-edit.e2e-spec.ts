/**
 * Editar el domicilio de una factura YA CONFIRMADA (`PATCH /invoices/:id/freight`).
 *
 * Existe porque el flete no siempre viene en el papel: a veces se le paga en
 * efectivo al que trae y el dueño lo recuerda al rato.
 *
 * Lo que se protege:
 *  1. Que siga sin tocar inventario ni costos (el flete nunca genera lotes).
 *  2. Que en una factura PAGADA el reparto por bolsillo siga sumando el total —
 *     sin eso Tesorería queda descuadrada en silencio (no hay CHECK que lo frene).
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('Editar el domicilio de una factura confirmada E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let adminToken: string;
  let duenoId: string;
  let ingredientId: string;

  const auth = () => ({ Authorization: `Bearer ${duenoToken}` });
  const MERCANCIA = 200_000;

  /** Crea una factura CONFIRMADA de $200.000 de mercancía, con o sin pago. */
  const facturar = async (opts: {
    flete?: number;
    pagada?: boolean;
    cash?: number;
    bank?: number;
  }): Promise<string> => {
    const draft = await prisma.invoice.create({
      data: {
        status: 'PENDING_REVIEW',
        aiModelUsed: 'test-mock',
        aiExtractionJson: {},
        uploadedById: duenoId,
      },
    });
    const flete = opts.flete ?? 0;
    const total = MERCANCIA + flete;
    let payment: Record<string, unknown> | undefined;
    if (opts.pagada) {
      const up = await request
        .post('/invoices/upload-payment-proof')
        .set(auth())
        .attach('proof', PNG_1PX, { filename: 'c.png', contentType: 'image/png' })
        .expect(201);
      payment = {
        proofStorageKey: up.body.proofStorageKey,
        cashAmount: opts.cash ?? 0,
        bankAmount: opts.bank ?? total - (opts.cash ?? 0),
      };
    }
    await request
      .post(`/invoices/${draft.id}/confirm`)
      .set(auth())
      .send({
        supplierNit: '900555444-1',
        supplierName: 'Proveedor Flete Edit',
        total,
        freight: flete > 0 ? flete : undefined,
        items: [
          {
            entityType: 'INGREDIENT',
            ingredientId,
            descriptionRaw: 'Insumo',
            quantity: 10,
            unit: 'kg',
            unitPrice: MERCANCIA / 10,
            total: MERCANCIA,
          },
        ],
        ...(payment ? { payment } : {}),
      })
      .expect(201);
    return draft.id;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    const [dueno] = await Promise.all([
      prisma.user.create({
        data: { email: 'dueno-fe@test.local', fullName: 'Dueño FE', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
      }),
      prisma.user.create({
        data: { email: 'admin-fe@test.local', fullName: 'Admin FE', role: 'ADMIN_OPERATIVO', passwordHash: hash, mustChangePwd: false, active: true },
      }),
    ]);
    duenoId = dueno.id;
    duenoToken = await loginAs(request, 'dueno-fe@test.local');
    adminToken = await loginAs(request, 'admin-fe@test.local');

    const ing = await request
      .post('/ingredients')
      .set(auth())
      .send({ name: 'Insumo FE', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0 })
      .expect(201);
    ingredientId = ing.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('factura confirmada SIN pagar', () => {
    it('agregar el domicilio sube el total y no toca ni un movimiento de inventario', async () => {
      const id = await facturar({});
      const antes = await prisma.inventoryMovement.count({
        where: { sourceType: 'invoice', sourceId: id },
      });

      const res = await request
        .patch(`/invoices/${id}/freight`)
        .set(auth())
        .send({ freight: 8_000, total: MERCANCIA + 8_000, note: 'Le pagué al de la moto' })
        .expect(200);

      expect(res.body.freightAmount).toBe(8_000);
      expect(res.body.total).toBe(208_000);
      // LA propiedad: el flete no se almacena, así que el inventario no cambia.
      expect(
        await prisma.inventoryMovement.count({ where: { sourceType: 'invoice', sourceId: id } }),
      ).toBe(antes);
      // Y el costo del insumo sigue saliendo solo de la línea.
      const ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
      expect(Number(ing.lastUnitCost)).toBeCloseTo(MERCANCIA / 10, 2);
    });

    it('poner el domicilio en 0 lo quita y devuelve el total a la mercancía', async () => {
      const id = await facturar({ flete: 5_000 });
      const res = await request
        .patch(`/invoices/${id}/freight`)
        .set(auth())
        .send({ freight: 0, total: MERCANCIA })
        .expect(200);
      expect(res.body.freightAmount).toBe(0);
      expect(res.body.total).toBe(MERCANCIA);
    });

    it('queda registrado en la bitácora con el antes y el después', async () => {
      const id = await facturar({});
      await request
        .patch(`/invoices/${id}/freight`)
        .set(auth())
        .send({ freight: 3_000, total: MERCANCIA + 3_000 })
        .expect(200);

      const log = await prisma.auditLog.findFirst({
        where: { action: 'INVOICE_FREIGHT_UPDATED', entityId: id },
      });
      expect(log).not.toBeNull();
      expect((log!.beforeJson as { freight: number }).freight).toBe(0);
      expect((log!.afterJson as { freight: number }).freight).toBe(3_000);
    });

    it('un total que ya no cuadra con los ítems es 400', async () => {
      const id = await facturar({});
      await request
        .patch(`/invoices/${id}/freight`)
        .set(auth())
        // El total no absorbió el flete: 200.000 ≠ 200.000 + 8.000.
        .send({ freight: 8_000, total: MERCANCIA })
        .expect(400);
    });

    it('un domicilio mayor al total es 400', async () => {
      const id = await facturar({});
      await request
        .patch(`/invoices/${id}/freight`)
        .set(auth())
        .send({ freight: 900_000, total: 500_000 })
        .expect(400);
    });
  });

  describe('factura YA PAGADA — el reparto por bolsillo tiene que seguir cuadrando', () => {
    it('sin decir de qué bolsillo salió, es 400 (si no, Tesorería queda descuadrada)', async () => {
      const id = await facturar({ pagada: true, cash: 0, bank: MERCANCIA });
      await request
        .patch(`/invoices/${id}/freight`)
        .set(auth())
        .send({ freight: 7_000, total: MERCANCIA + 7_000 })
        .expect(400);
    });

    it('con el bolsillo indicado, la diferencia entra ahí y el reparto suma el total', async () => {
      const id = await facturar({ pagada: true, cash: 0, bank: MERCANCIA });
      const res = await request
        .patch(`/invoices/${id}/freight`)
        .set(auth())
        .send({ freight: 7_000, total: MERCANCIA + 7_000, pocket: 'EFECTIVO' })
        .expect(200);

      expect(res.body.total).toBe(207_000);
      expect(res.body.paymentCashAmount).toBe(7_000);
      expect(res.body.paymentBankAmount).toBe(MERCANCIA);
      // La invariante de Tesorería: efectivo + cuenta = total.
      expect(res.body.paymentCashAmount + res.body.paymentBankAmount).toBe(res.body.total);
      // Y el bolsillo pasa a MIXTO, que es lo que muestra la pantalla.
      expect(res.body.paymentPocket).toBe('MIXTO');
    });

    it('bajar el domicilio devuelve la plata al bolsillo elegido', async () => {
      const id = await facturar({ pagada: true, flete: 10_000, cash: 10_000, bank: MERCANCIA });
      const res = await request
        .patch(`/invoices/${id}/freight`)
        .set(auth())
        .send({ freight: 4_000, total: MERCANCIA + 4_000, pocket: 'EFECTIVO' })
        .expect(200);
      expect(res.body.paymentCashAmount).toBe(4_000);
      expect(res.body.paymentCashAmount + res.body.paymentBankAmount).toBe(res.body.total);
    });

    it('si el bolsillo elegido no cubre la rebaja, es 400 y no deja un monto negativo', async () => {
      const id = await facturar({ pagada: true, flete: 10_000, cash: 1_000, bank: MERCANCIA + 9_000 });
      await request
        .patch(`/invoices/${id}/freight`)
        .set(auth())
        // Bajar $9.000 del efectivo, que solo tiene $1.000.
        .send({ freight: 1_000, total: MERCANCIA + 1_000, pocket: 'EFECTIVO' })
        .expect(400);
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(Number(inv.paymentCashAmount)).toBe(1_000);
      expect(Number(inv.freightAmount)).toBe(10_000);
    });
  });

  describe('estado y permisos', () => {
    it('una factura sin confirmar no se edita por acá (el domicilio va en el confirm)', async () => {
      const draft = await prisma.invoice.create({
        data: { status: 'PENDING_REVIEW', aiModelUsed: 'test-mock', aiExtractionJson: {} },
      });
      await request
        .patch(`/invoices/${draft.id}/freight`)
        .set(auth())
        .send({ freight: 5_000, total: 5_000 })
        .expect(400);
    });

    it('el admin operativo no puede tocar el domicilio de una factura ajena', async () => {
      const id = await facturar({});
      await request
        .patch(`/invoices/${id}/freight`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({ freight: 5_000, total: MERCANCIA + 5_000 })
        .expect(403);
    });

    it('dos ediciones sobre el mismo punto de partida: solo una gana', async () => {
      const id = await facturar({});
      const editar = (flete: number) =>
        request
          .patch(`/invoices/${id}/freight`)
          .set(auth())
          .send({ freight: flete, total: MERCANCIA + flete });

      const res = await Promise.all([editar(5_000), editar(9_000)]);
      const ok = res.filter((r) => r.status === 200);
      expect(ok).toHaveLength(1);

      // El total refleja EXACTAMENTE al ganador: nunca las dos diferencias
      // aplicadas una sobre otra.
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(Number(inv.total)).toBe(MERCANCIA + Number(inv.freightAmount));
    });
  });
});
