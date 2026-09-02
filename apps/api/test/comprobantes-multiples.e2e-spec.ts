/**
 * Un pago admite VARIOS comprobantes (`POST/DELETE .../proofs`).
 *
 * La forma en que se guardan es lo que hace que esto NO rompa nada: la primera
 * imagen sigue viviendo en la columna de siempre (`payment_proof_key` /
 * `proof_image_key`) y las demás en la columna nueva de extras. Todo lo que ya
 * leía la columna vieja —`hasProof`, el endpoint del comprobante, tesorería,
 * los reportes— sigue viendo exactamente lo mismo.
 *
 * Lo que se protege:
 *  1. Que la columna vieja NUNCA quede sin la primera imagen si hay alguna
 *     (si no, `hasProof` diría "sin comprobante" con imágenes cargadas).
 *  2. Que un pago que EXIGE comprobante no se pueda quedar en cero.
 *  3. Que quitar la primera promueva la siguiente en vez de dejar un hueco.
 *  4. Que el tope se valide ANTES de subir (basura en el bucket).
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { MAX_PROOFS_POR_PAGO } from '@pos-tercos/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const PIN = '424242';
const MERCANCIA = 200_000;

describe('Comprobantes múltiples por pago E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let adminToken: string;
  let duenoId: string;
  let ingredientId: string;

  const auth = () => ({ Authorization: `Bearer ${duenoToken}` });
  const conPin = () => ({ ...auth(), 'X-Approval-Pin': PIN });
  const adjuntar = (
    req: supertest.Test,
    campo: string,
    cuantas: number,
  ): supertest.Test => {
    let r = req;
    for (let i = 0; i < cuantas; i++) {
      r = r.attach(campo, PNG_1PX, { filename: `c${i}.png`, contentType: 'image/png' });
    }
    return r;
  };

  /** Factura CONFIRMADA por pagar. */
  const facturar = async (): Promise<string> => {
    const draft = await prisma.invoice.create({
      data: {
        status: 'PENDING_REVIEW',
        aiModelUsed: 'test-mock',
        aiExtractionJson: {},
        uploadedById: duenoId,
      },
    });
    await request
      .post(`/invoices/${draft.id}/confirm`)
      .set(auth())
      .send({
        supplierNit: '900111222-3',
        supplierName: 'Proveedor Comprobantes',
        total: MERCANCIA,
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
      })
      .expect(201);
    return draft.id;
  };

  /** Factura pagada con `cuantas` comprobantes. */
  const facturarYPagar = async (cuantas: number): Promise<string> => {
    const id = await facturar();
    await adjuntar(
      request.post(`/invoices/${id}/payment/paid`).set(conPin()).field('bankAmount', MERCANCIA),
      'proof',
      cuantas,
    ).expect(201);
    return id;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    const [dueno] = await Promise.all([
      prisma.user.create({
        data: {
          email: 'dueno-cmp@test.local',
          fullName: 'Dueño CMP',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      }),
      prisma.user.create({
        data: {
          email: 'admin-cmp@test.local',
          fullName: 'Admin CMP',
          role: 'ADMIN_OPERATIVO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      }),
    ]);
    duenoId = dueno.id;
    duenoToken = await loginAs(request, 'dueno-cmp@test.local');
    adminToken = await loginAs(request, 'admin-cmp@test.local');
    await request.post('/approvals/pin').set(auth()).send({ pin: PIN, password: 'dev12345' }).expect(201);

    const ing = await request
      .post('/ingredients')
      .set(auth())
      .send({
        name: 'Insumo CMP',
        unitPurchase: 'kg',
        unitRecipe: 'g',
        conversionFactor: 1000,
        thresholdMin: 0,
      })
      .expect(201);
    ingredientId = ing.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('factura de proveedor', () => {
    it('se paga con varios comprobantes de una sola vez', async () => {
      const id = await facturarYPagar(3);
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      // LA propiedad: el primero sigue en la columna VIEJA (nadie que la lea se
      // entera del cambio) y solo los extras van a la nueva.
      expect(inv.paymentProofKey).not.toBeNull();
      expect(inv.paymentProofExtraKeys).toHaveLength(2);

      const res = await request.get(`/invoices/${id}`).set(auth()).expect(200);
      expect(res.body.hasPaymentProof).toBe(true);
      expect(res.body.paymentProofsCount).toBe(3);
    });

    it('un pago de un solo comprobante deja la columna nueva vacía (como antes)', async () => {
      const id = await facturarYPagar(1);
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(inv.paymentProofKey).not.toBeNull();
      expect(inv.paymentProofExtraKeys).toEqual([]);
    });

    it('la ruta de siempre sigue devolviendo el PRIMER comprobante', async () => {
      const id = await facturarYPagar(2);
      const viejo = await request.get(`/invoices/${id}/payment-proof`).set(auth()).expect(200);
      const cero = await request.get(`/invoices/${id}/payment-proof/0`).set(auth()).expect(200);
      expect(viejo.headers['content-type']).toContain('image/');
      expect(Buffer.compare(viejo.body as Buffer, cero.body as Buffer)).toBe(0);
      await request.get(`/invoices/${id}/payment-proof/1`).set(auth()).expect(200);
      await request.get(`/invoices/${id}/payment-proof/9`).set(auth()).expect(404);
    });

    it('se le suman comprobantes después, sin mover plata ni estado', async () => {
      const id = await facturarYPagar(1);
      const antes = await prisma.invoice.findUniqueOrThrow({ where: { id } });

      const res = await adjuntar(
        request.post(`/invoices/${id}/payment/proofs`).set(auth()),
        'proofs',
        2,
      ).expect(201);
      expect(res.body.paymentProofsCount).toBe(3);

      const despues = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      // La plata y el estado no se tocan: agregar un soporte no es re-pagar.
      expect(despues.paymentStatus).toBe(antes.paymentStatus);
      expect(Number(despues.paymentBankAmount)).toBe(Number(antes.paymentBankAmount));
      expect(despues.paidAt?.toISOString()).toBe(antes.paidAt?.toISOString());
      // Y el primero SIGUE siendo el mismo: agregar no reordena.
      expect(despues.paymentProofKey).toBe(antes.paymentProofKey);
    });

    it('quitar el primero promueve al siguiente a la columna vieja', async () => {
      const id = await facturarYPagar(3);
      const antes = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      const segundo = antes.paymentProofExtraKeys[0];

      await request.delete(`/invoices/${id}/payment/proofs/0`).set(auth()).expect(200);

      const despues = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(despues.paymentProofKey).toBe(segundo);
      expect(despues.paymentProofExtraKeys).toHaveLength(1);
      // hasPaymentProof no puede volverse false mientras quede alguna.
      const res = await request.get(`/invoices/${id}`).set(auth()).expect(200);
      expect(res.body.hasPaymentProof).toBe(true);
      expect(res.body.paymentProofsCount).toBe(2);
    });

    it('una factura pagada NUNCA se queda sin comprobante', async () => {
      const id = await facturarYPagar(1);
      const res = await request.delete(`/invoices/${id}/payment/proofs/0`).set(auth()).expect(400);
      expect(res.body.message).toMatch(/al menos un comprobante/i);
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(inv.paymentProofKey).not.toBeNull();
    });

    it('quitar un índice que no existe es 400 con un mensaje de persona', async () => {
      const id = await facturarYPagar(2);
      const res = await request.delete(`/invoices/${id}/payment/proofs/7`).set(auth()).expect(400);
      expect(res.body.message).toMatch(/ya no existe/i);
    });

    it('el tope se valida ANTES de subir: no deja basura en el bucket', async () => {
      const id = await facturarYPagar(MAX_PROOFS_POR_PAGO);
      const res = await adjuntar(
        request.post(`/invoices/${id}/payment/proofs`).set(auth()),
        'proofs',
        1,
      ).expect(400);
      expect(res.body.message).toMatch(new RegExp(`hasta ${MAX_PROOFS_POR_PAGO} comprobantes`));

      const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(inv.paymentProofExtraKeys).toHaveLength(MAX_PROOFS_POR_PAGO - 1);
    });

    it('una factura sin pagar no admite comprobantes sueltos', async () => {
      const id = await facturar();
      const res = await adjuntar(
        request.post(`/invoices/${id}/payment/proofs`).set(auth()),
        'proofs',
        1,
      ).expect(400);
      expect(res.body.message).toMatch(/ya pagada/i);
    });

    it('el admin operativo no toca los comprobantes de una factura ajena', async () => {
      const id = await facturarYPagar(2);
      const otro = { Authorization: `Bearer ${adminToken}` };
      await adjuntar(request.post(`/invoices/${id}/payment/proofs`).set(otro), 'proofs', 1).expect(403);
      await request.delete(`/invoices/${id}/payment/proofs/0`).set(otro).expect(403);
    });

    it('desmarcar el pago limpia TODOS los comprobantes, no solo el primero', async () => {
      const id = await facturarYPagar(3);
      await request.delete(`/invoices/${id}/payment`).set(conPin()).expect(200);
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(inv.paymentProofKey).toBeNull();
      expect(inv.paymentProofExtraKeys).toEqual([]);
    });

    it('queda registrado en la bitácora quién agregó y quién quitó', async () => {
      const id = await facturarYPagar(2);
      await adjuntar(request.post(`/invoices/${id}/payment/proofs`).set(auth()), 'proofs', 1).expect(
        201,
      );
      await request.delete(`/invoices/${id}/payment/proofs/2`).set(auth()).expect(200);

      const acciones = await prisma.auditLog.findMany({
        where: { entityId: id, action: { in: ['INVOICE_PAYMENT_PROOFS_ADDED', 'INVOICE_PAYMENT_PROOF_REMOVED'] } },
      });
      expect(acciones).toHaveLength(2);
    });
  });

  describe('compromiso (el comprobante es OPCIONAL)', () => {
    const crearCompromiso = async (): Promise<string> => {
      const res = await request
        .post('/payables')
        .set(auth())
        .send({ beneficiary: 'Cristian', description: 'Arreglo nevera', amount: 80_000 })
        .expect(201);
      return res.body.id as string;
    };

    it('se paga con varios comprobantes y se les suma otro después', async () => {
      const id = await crearCompromiso();
      await adjuntar(
        request
          .post(`/payables/${id}/pay`)
          .set(auth())
          .field('payload', JSON.stringify({ cashAmount: 0, bankAmount: 80_000 })),
        'proof',
        2,
      ).expect(201);

      const res = await adjuntar(
        request.post(`/payables/${id}/proofs`).set(auth()),
        'proofs',
        1,
      ).expect(201);
      expect(res.body.proofsCount).toBe(3);
      expect(res.body.hasProof).toBe(true);
    });

    it('se puede pagar SIN comprobante y agregarlo luego', async () => {
      const id = await crearCompromiso();
      const pagado = await request
        .post(`/payables/${id}/pay`)
        .set(auth())
        .field('payload', JSON.stringify({ cashAmount: 80_000, bankAmount: 0 }))
        .expect(201);
      expect(pagado.body.hasProof).toBe(false);
      expect(pagado.body.proofsCount).toBe(0);

      const res = await adjuntar(
        request.post(`/payables/${id}/proofs`).set(auth()),
        'proofs',
        1,
      ).expect(201);
      expect(res.body.hasProof).toBe(true);
      expect(res.body.proofsCount).toBe(1);
    });

    it('acá SÍ se puede quitar el último: el comprobante no es obligatorio', async () => {
      const id = await crearCompromiso();
      await adjuntar(
        request
          .post(`/payables/${id}/pay`)
          .set(auth())
          .field('payload', JSON.stringify({ cashAmount: 0, bankAmount: 80_000 })),
        'proof',
        1,
      ).expect(201);

      const res = await request.delete(`/payables/${id}/proofs/0`).set(auth()).expect(200);
      expect(res.body.hasProof).toBe(false);
      expect(res.body.proofsCount).toBe(0);
    });
  });
});
