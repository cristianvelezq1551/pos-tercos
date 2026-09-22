/**
 * bolsillo-en-pagos.e2e-spec.ts
 *
 * El cockpit de "Pagos y cobros" tiene que decir de qué bolsillo salió CADA
 * pago (efectivo o cuenta). El dato vive en la base desde siempre, pero no
 * viajaba al DTO: la pantalla mostraba el monto y la fecha, y de dónde salió la
 * plata solo se podía averiguar entrando a cada módulo.
 *
 * Lo que fija esta suite es el CONTRATO: si alguien quita `cashAmount` del
 * select, la pantalla vuelve a quedar muda sin que nada más falle.
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { hoyLocal } from './helpers/local-day';

describe('El cockpit de pagos dice de qué bolsillo salió cada pago', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;

  const auth = () => ({ Authorization: `Bearer ${duenoToken}` });
  const [anio, mes] = hoyLocal().split('-').map(Number);

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'dueno.bolsillo@test.local',
        passwordHash: hash,
        fullName: 'Dueño Bolsillo',
        role: 'DUENO',
      },
    });
    duenoToken = await loginAs(request, 'dueno.bolsillo@test.local', 'dev12345');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const pagarCompromiso = async (
    beneficiario: string,
    monto: number,
    cashAmount: number,
    bankAmount: number,
  ): Promise<void> => {
    const creado = await request
      .post('/payables')
      .set(auth())
      .send({ beneficiary: beneficiario, description: 'Prueba de bolsillo', amount: monto })
      .expect(201);
    await request
      .post(`/payables/${creado.body.id}/pay`)
      .set(auth())
      .field('payload', JSON.stringify({ cashAmount, bankAmount }))
      .expect(201);
  };

  const cockpit = async () => {
    const res = await request
      .get(`/reports/finance-summary?year=${anio}&month=${mes}`)
      .set(auth())
      .expect(200);
    return res.body as {
      paidPayables: { beneficiary: string; cashAmount?: number; bankAmount?: number }[];
    };
  };

  it('un pago en efectivo llega con su reparto', async () => {
    await pagarCompromiso('Zapatero', 150_000, 150_000, 0);
    const { paidPayables } = await cockpit();
    const fila = paidPayables.find((p) => p.beneficiary === 'Zapatero');
    expect(fila).toBeDefined();
    expect(fila?.cashAmount).toBe(150_000);
    expect(fila?.bankAmount).toBe(0);
  });

  it('un pago por cuenta llega con su reparto', async () => {
    await pagarCompromiso('Contador', 200_000, 0, 200_000);
    const { paidPayables } = await cockpit();
    const fila = paidPayables.find((p) => p.beneficiary === 'Contador');
    expect(fila?.cashAmount).toBe(0);
    expect(fila?.bankAmount).toBe(200_000);
  });

  it('un pago mixto conserva las DOS partes, no solo la mayor', async () => {
    // Es el caso que obliga a mandar los dos montos y no un enum: la pantalla
    // muestra "Efectivo $80.000 · Cuenta $120.000" en el tooltip.
    await pagarCompromiso('Plomero', 200_000, 80_000, 120_000);
    const { paidPayables } = await cockpit();
    const fila = paidPayables.find((p) => p.beneficiary === 'Plomero');
    expect(fila?.cashAmount).toBe(80_000);
    expect(fila?.bankAmount).toBe(120_000);
  });

  it('el reparto de cada pago suma exactamente lo que se pagó', async () => {
    const { paidPayables } = await cockpit();
    expect(paidPayables.length).toBeGreaterThanOrEqual(3);
    for (const p of paidPayables) {
      const fila = p as typeof p & { amount: number };
      expect((fila.cashAmount ?? 0) + (fila.bankAmount ?? 0)).toBeCloseTo(fila.amount, 2);
    }
  });
});
