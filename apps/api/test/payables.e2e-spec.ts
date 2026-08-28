/**
 * payables.e2e-spec.ts
 *
 * Cuentas por pagar a personas (compromisos ad-hoc): crear, pagar con reparto
 * por bolsillo (efectivo/cuenta), cancelar, y que un compromiso PAGADO se
 * refleje como gasto en la Tesorería. Dueño-only.
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Payables E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createPayable = async (amount: number, beneficiary = 'Pablo') => {
    const res = await request
      .post('/payables')
      .set(auth(duenoToken))
      .send({ beneficiary, description: 'Préstamo', amount })
      .expect(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-payables@test.local', fullName: 'Dueño Payables', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-payables@test.local', fullName: 'Cajero Payables', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-payables@test.local');
    cajeroToken = await loginAs(request, 'cajero-payables@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('rechaza acceso a un rol no-dueño (403)', async () => {
    await request.get('/payables').set(auth(cajeroToken)).expect(403);
  });

  it('crea un compromiso en estado PENDING', async () => {
    const id = await createPayable(100_000);
    const list = await request.get('/payables?status=PENDING').set(auth(duenoToken)).expect(200);
    const found = (list.body as Array<{ id: string; status: string; amount: number }>).find((p) => p.id === id);
    expect(found).toBeDefined();
    expect(found?.status).toBe('PENDING');
    expect(found?.amount).toBe(100_000);
  });

  it('paga con reparto efectivo + cuenta que suma el monto → PAID', async () => {
    const id = await createPayable(50_000);
    const res = await request
      .post(`/payables/${id}/pay`)
      .set(auth(duenoToken))
      .field('payload', JSON.stringify({ cashAmount: 20_000, bankAmount: 30_000 }))
      .expect(201);
    expect(res.body.status).toBe('PAID');
    expect(res.body.cashAmount).toBe(20_000);
    expect(res.body.bankAmount).toBe(30_000);
    expect(res.body.paidAt).not.toBeNull();
  });

  it('rechaza el pago cuando efectivo + cuenta NO suma el monto (400)', async () => {
    const id = await createPayable(50_000);
    await request
      .post(`/payables/${id}/pay`)
      .set(auth(duenoToken))
      .field('payload', JSON.stringify({ cashAmount: 10_000, bankAmount: 10_000 }))
      .expect(400);
  });

  it('rechaza pagar dos veces el mismo compromiso (400)', async () => {
    const id = await createPayable(10_000);
    await request
      .post(`/payables/${id}/pay`)
      .set(auth(duenoToken))
      .field('payload', JSON.stringify({ cashAmount: 0, bankAmount: 10_000 }))
      .expect(201);
    await request
      .post(`/payables/${id}/pay`)
      .set(auth(duenoToken))
      .field('payload', JSON.stringify({ cashAmount: 0, bankAmount: 10_000 }))
      .expect(400);
  });

  it('idempotencia: pagar dos veces con la misma key devuelve el mismo pago (no re-desembolsa)', async () => {
    const id = await createPayable(25_000);
    const key = randomUUID();
    const pay = () =>
      request
        .post(`/payables/${id}/pay`)
        .set(auth(duenoToken))
        .set('Idempotency-Key', key)
        .field('payload', JSON.stringify({ cashAmount: 0, bankAmount: 25_000 }))
        .expect(201);
    const a = await pay();
    const b = await pay(); // retry con la MISMA key → respuesta cacheada, no un 2do pago
    expect(b.body.id).toBe(a.body.id);
    expect(b.body.status).toBe('PAID');
  });

  it('cancela un compromiso PENDING', async () => {
    const id = await createPayable(15_000);
    await request.post(`/payables/${id}/cancel`).set(auth(duenoToken)).expect(201);
    const list = await request.get('/payables?status=CANCELLED').set(auth(duenoToken)).expect(200);
    expect((list.body as Array<{ id: string }>).some((p) => p.id === id)).toBe(true);
  });

  it('rechaza cancelar un compromiso ya pagado (400)', async () => {
    const id = await createPayable(8_000);
    await request
      .post(`/payables/${id}/pay`)
      .set(auth(duenoToken))
      .field('payload', JSON.stringify({ cashAmount: 8_000, bankAmount: 0 }))
      .expect(201);
    await request.post(`/payables/${id}/cancel`).set(auth(duenoToken)).expect(400);
  });

  it('un compromiso PAGADO se refleja como gasto en la Tesorería', async () => {
    await request
      .patch('/treasury/config')
      .set(auth(duenoToken))
      .send({ anchorDate: null, initialCash: 0, initialBank: 500_000 })
      .expect(200);

    const before = await request.get('/treasury/summary').set(auth(duenoToken)).expect(200);
    const bankExpBefore = before.body.bank.expensesPaid as number;
    const bankBalBefore = before.body.bank.balance as number;

    const id = await createPayable(40_000, 'Proveedor X');
    await request
      .post(`/payables/${id}/pay`)
      .set(auth(duenoToken))
      .field('payload', JSON.stringify({ cashAmount: 0, bankAmount: 40_000 }))
      .expect(201);

    const after = await request.get('/treasury/summary').set(auth(duenoToken)).expect(200);
    expect(after.body.bank.expensesPaid).toBe(bankExpBefore + 40_000);
    expect(after.body.bank.balance).toBe(bankBalBefore - 40_000);
  });

  /**
   * H1 de la auditoría: los compromisos NUNCA llegaban al estado de resultados.
   * `FinancialReportsService` solo leía COGS, nómina y costos fijos, así que un
   * arreglo del horno salía de tesorería sin bajar el neto ni mover el punto de
   * equilibrio — el dueño decidía con una ganancia inflada.
   */
  describe('impacto en el estado financiero', () => {
    const now = new Date();
    const estado = async (): Promise<{
      netResult: number;
      payablesPaidCost: number;
      payablesPaidCount: number;
      breakEven: number | null;
    }> =>
      (
        await request
          .get(`/reports/financial/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
          .set(auth(duenoToken))
          .expect(200)
      ).body;

    it('un compromiso PENDIENTE no baja el resultado: mientras se debe es deuda, no pérdida', async () => {
      const antes = await estado();
      await createPayable(120_000, 'Técnico del horno');
      const despues = await estado();
      expect(despues.netResult).toBeCloseTo(antes.netResult, 2);
      expect(despues.payablesPaidCost).toBeCloseTo(antes.payablesPaidCost, 2);
    });

    it('al PAGARLO baja el neto por su monto y queda contado', async () => {
      const antes = await estado();
      const id = await createPayable(120_000, 'Técnico del horno');
      await request
        .post(`/payables/${id}/pay`)
        .set(auth(duenoToken))
        .field('payload', JSON.stringify({ cashAmount: 120_000, bankAmount: 0 }))
        .expect(201);

      const despues = await estado();
      expect(despues.payablesPaidCost - antes.payablesPaidCost).toBeCloseTo(120_000, 2);
      expect(despues.payablesPaidCount - antes.payablesPaidCount).toBe(1);
      expect(antes.netResult - despues.netResult).toBeCloseTo(120_000, 2);
    });

    it('devolver un préstamo NO baja el resultado (esa plata ya se había recibido)', async () => {
      const antes = await estado();
      const res = await request
        .post('/payables')
        .set(auth(duenoToken))
        .send({
          beneficiary: 'Pablo',
          description: 'Devolución del préstamo de la moto',
          amount: 500_000,
          isExpense: false,
        })
        .expect(201);
      expect(res.body.isExpense).toBe(false);

      await request
        .post(`/payables/${res.body.id}/pay`)
        .set(auth(duenoToken))
        .field('payload', JSON.stringify({ cashAmount: 0, bankAmount: 500_000 }))
        .expect(201);

      const despues = await estado();
      // Ni un peso: contarlo mostraría un bajón de medio millón que no existe.
      expect(despues.netResult).toBeCloseTo(antes.netResult, 2);
      expect(despues.payablesPaidCost).toBeCloseTo(antes.payablesPaidCost, 2);
      expect(despues.payablesPaidCount).toBe(antes.payablesPaidCount);
    });

    it('sin decir nada, un compromiso nace como GASTO (el caso común)', async () => {
      const res = await request
        .post('/payables')
        .set(auth(duenoToken))
        .send({ beneficiary: 'Ferretería', description: 'Arreglo de la campana', amount: 30_000 })
        .expect(201);
      expect(res.body.isExpense).toBe(true);
    });

    it('un compromiso pagado NO mueve el punto de equilibrio (no se repite todos los meses)', async () => {
      // El equilibrio mide el piso de operación: un arreglo puntual no lo
      // define. Si un gasto se repite cada mes, su lugar es Costos fijos.
      await request
        .post('/fixed-costs')
        .set(auth(duenoToken))
        .send({ name: 'Arriendo Pay', category: 'Local', amount: 1_000_000, frequency: 'MONTHLY' })
        .expect(201);
      const antes = await estado();

      const id = await createPayable(200_000, 'Plomero');
      await request
        .post(`/payables/${id}/pay`)
        .set(auth(duenoToken))
        .field('payload', JSON.stringify({ cashAmount: 200_000, bankAmount: 0 }))
        .expect(201);

      const despues = await estado();
      expect(despues.breakEven).toBe(antes.breakEven);
      // Pero el neto SÍ bajó: es plata que salió.
      expect(antes.netResult - despues.netResult).toBeCloseTo(200_000, 2);
    });
  });
});
