/**
 * devengado-vs-pagado.e2e-spec.ts — las dos vistas de la misma plata.
 *
 * El negocio lleva DOS libros sobre los mismos gastos, y los dos son correctos:
 *
 *  - **El estado de resultados** cuenta lo DEVENGADO: la nómina y los costos
 *    fijos del mes pesan aunque todavía no se hayan pagado. Es lo que responde
 *    "¿este mes gané o perdí?".
 *  - **Finanzas y tesorería** cuentan la CAJA: lo que de verdad salió del
 *    bolsillo, y lo que queda debiendo. Es lo que responde "¿con cuánta plata
 *    cuento?".
 *
 * Cada módulo tiene su suite; lo que nadie verificaba es que los dos se muevan
 * de forma coherente. Es la costura clásica donde dos números de la misma plata
 * se separan sin que nadie lo note: alguien trabaja y no se le paga, o se paga
 * dos veces, o se anula un pago, y una vista se entera y la otra no.
 *
 * Las leyes:
 *  1. Trabajar sin cobrar YA pesa en el resultado, y aparece como pendiente.
 *  2. Pagar NO cambia el resultado (ya estaba cargado) pero sí la caja.
 *  3. Lo devengado se reparte entre lo pagado y lo pendiente, sin perderse.
 *  4. Un costo fijo pesa UNA vez en el mes, se pague cuando se pague.
 *  5. Anular un pago devuelve la plata al bolsillo y la deuda a pendiente,
 *     sin tocar el resultado.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/** PNG mínimo válido: el comprobante se valida por los bytes, no por el nombre. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/an3AAAAAElFTkSuQmCC',
  'base64',
);

interface Resultado {
  totalFixed: number;
  netResult: number;
  fixedCosts: Array<{ name: string; monthlyAmount: number; isOneTime: boolean }>;
}
interface Caja {
  paid: { payroll: number; fixedCosts: number; total: number };
  pending: { payroll: number; fixedCosts: number; total: number };
  netCash: number;
}
interface Bolsillos {
  cash: { balance: number };
  bank: { balance: number };
  total: number;
}

describe('Devengado contra pagado: las dos vistas de la misma plata E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let empleadoId: string;

  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

  /** Semana fija y pasada: si fuera "esta semana", lo devengado cambiaría
   *  según el día en que corra el test y los números no serían estables. */
  const SEMANA = '2026-05-13';
  const MES = { year: 2026, month: 5 };
  const rangoMes = `year=${MES.year}&month=${MES.month}`;
  /** El mes en que ocurren los pagos de esta corrida: hoy. */
  const hoy = new Date();
  const MES_DE_PAGO = { year: hoy.getFullYear(), month: hoy.getMonth() + 1 };

  const resultado = async (): Promise<Resultado> =>
    (await request.get(`/reports/financial/monthly?${rangoMes}`).set(auth()).expect(200))
      .body as Resultado;

  /**
   * Vista de CAJA. Por defecto la del mes en que se está pagando (hoy), que es
   * donde aparece el movimiento: el trabajo puede ser de mayo y la plata salir
   * en agosto. Justamente esa separación es lo que estas leyes miden.
   */
  const caja = async (mes = MES_DE_PAGO): Promise<Caja> =>
    (await request
      .get(`/reports/finance-summary?year=${mes.year}&month=${mes.month}`)
      .set(auth())
      .expect(200)).body as Caja;

  const bolsillos = async (): Promise<Bolsillos> =>
    (await request.get('/treasury/summary').set(auth()).expect(200)).body as Bolsillos;

  const inicioSemana = async (): Promise<string> =>
    (
      (await request.get(`/workers/weekly?week=${SEMANA}`).set(auth()).expect(200)).body as {
        weekStart: string;
      }
    ).weekStart;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Lee agregados GLOBALES: un residuo de otra suite mueve los números y el
    // fallo dependería del orden de los archivos.
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    const [, trabajador] = await Promise.all([
      prisma.user.create({
        data: {
          email: 'dueno-dvp@test.local',
          fullName: 'Dueño DvP',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      }),
      prisma.user.create({
        data: {
          email: 'trabajador-dvp@test.local',
          fullName: 'Luis Diario',
          role: 'TRABAJADOR',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
          payType: 'DAILY',
          salaryAmount: 60_000,
          hireDate: new Date(Date.UTC(2020, 0, 1)),
        },
      }),
    ]);
    empleadoId = trabajador.id;
    token = await loginAs(request, 'dueno-dvp@test.local');

    // Tesorería anclada ANTES del mes que se mide: así los pagos del mes
    // mueven el bolsillo (lo anterior al ancla ya está en el saldo inicial).
    await request
      .patch('/treasury/config')
      .set(auth())
      .send({ anchorDate: '2026-05-01', initialCash: 1_000_000, initialBank: 5_000_000 })
      .expect(200);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('L1 · trabajar sin cobrar YA pesa en el resultado del mes y queda como pendiente', async () => {
    // Es lo que distingue las dos vistas: el trabajo hecho es un costo del mes
    // aunque la plata siga en el bolsillo. Si el resultado esperara al pago, un
    // mes con la nómina atrasada se leería como si hubiera ido bien.
    const r = await resultado();
    const c = await caja(MES);

    const nomina = r.fixedCosts.find((l) => l.name === 'Nómina (auto)');
    expect(nomina).toBeDefined();
    expect(nomina!.monthlyAmount).toBeGreaterThan(0);

    // Nada pagado todavía: todo el costo devengado está esperando.
    expect(c.paid.payroll).toBe(0);
    expect(c.pending.payroll).toBeGreaterThan(0);
  });

  it('L2 · pagar NO cambia el resultado del mes trabajado, pero sí la caja del mes en que se paga', async () => {
    // El costo ya estaba contado en MAYO (L1). Pagarlo en agosto mueve plata,
    // no resultado — y la mueve en AGOSTO, que es cuando salió del bolsillo.
    // Si el pago volviera a restar del resultado, mayo cargaría dos veces el
    // mismo sueldo; si la caja lo pusiera en mayo, agosto se leería con más
    // plata de la que tiene.
    const antesResultado = await resultado();
    const antesCaja = await caja();
    const antesBolsillo = await bolsillos();
    const ABONO = 120_000;

    await request
      .post('/workers/weekly/pay')
      .set(auth())
      .field(
        'payload',
        JSON.stringify({
          userId: empleadoId,
          weekStart: await inicioSemana(),
          days: [],
          cashAmount: ABONO,
          bankAmount: 0,
        }),
      )
      .attach('proof', PNG, 'comprobante.png')
      .expect(201);

    const despuesResultado = await resultado();
    const despuesCaja = await caja();
    const despuesBolsillo = await bolsillos();

    // El resultado del mes no se movió: el trabajo ya estaba cargado.
    expect(despuesResultado.netResult).toBeCloseTo(antesResultado.netResult, 2);
    expect(despuesResultado.totalFixed).toBeCloseTo(antesResultado.totalFixed, 2);

    // La caja sí: sale plata y baja lo que se debe.
    expect(despuesCaja.paid.payroll - antesCaja.paid.payroll).toBeCloseTo(ABONO, 2);
    expect(antesCaja.pending.payroll - despuesCaja.pending.payroll).toBeCloseTo(ABONO, 2);
    expect(antesCaja.netCash - despuesCaja.netCash).toBeCloseTo(ABONO, 2);

    // Y el bolsillo de efectivo, que es de donde salió.
    expect(antesBolsillo.cash.balance - despuesBolsillo.cash.balance).toBeCloseTo(ABONO, 2);
    expect(despuesBolsillo.bank.balance).toBeCloseTo(antesBolsillo.bank.balance, 2);
  });

  it('L3 · lo devengado de una semana se reparte entre lo abonado y lo que falta', async () => {
    // La identidad de la costura, a nivel de la unidad en que el negocio paga:
    // la semana. Lo que se devengó (días trabajados ± ajustes) tiene que ser
    // exactamente lo abonado más lo que falta. Si no cerrara, habría plata
    // devengada que no está ni pagada ni pendiente — o sea, invisible.
    const wk = (await request.get(`/workers/weekly?week=${SEMANA}`).set(auth()).expect(200))
      .body as {
      entries: Array<{
        userId: string;
        owedTotal: number;
        adjustmentsTotal: number;
        netOwed: number;
        paidTotal: number;
        remaining: number;
      }>;
    };
    const fila = wk.entries.find((e) => e.userId === empleadoId)!;

    expect(fila.netOwed).toBeCloseTo(fila.owedTotal + fila.adjustmentsTotal, 2);
    expect(fila.netOwed).toBeCloseTo(fila.paidTotal + fila.remaining, 2);
    // Se abonó algo (L2) y todavía falta: la semana está a medio pagar, que es
    // el estado donde las dos vistas tienen que decir cosas distintas y ambas
    // ser correctas.
    expect(fila.paidTotal).toBeGreaterThan(0);
    expect(fila.remaining).toBeGreaterThan(0);

    // Y lo que falta de ESTA semana está contenido en el pendiente global del
    // mes: el pendiente suma todas las semanas sin saldar, no solo una.
    const c = await caja(MES);
    expect(c.pending.payroll).toBeGreaterThanOrEqual(fila.remaining);
    // Nunca negativo: eso significaría haber pagado de más, y el sistema lo
    // rechaza antes (anti doble-abono).
    expect(c.pending.payroll).toBeGreaterThanOrEqual(0);
  });

  it('L4 · un costo fijo recurrente pesa UNA vez en el mes, se pague cuando se pague', async () => {
    // El arriendo del mes es un costo del mes: pagarlo tarde no lo mueve de
    // lugar. Lo que cambia al pagarlo es la caja, no el resultado.
    const antes = await resultado();
    const creado = await request
      .post('/fixed-costs')
      .set(auth())
      .send({
        name: 'Arriendo DvP',
        category: 'Arriendo',
        amount: 800_000,
        frequency: 'MONTHLY',
        startedAt: '2026-05-01',
      })
      .expect(201);

    const conCosto = await resultado();
    expect(conCosto.totalFixed - antes.totalFixed).toBeCloseTo(800_000, 2);
    expect(antes.netResult - conCosto.netResult).toBeCloseTo(800_000, 2);

    // Ahora se paga: el resultado NO se mueve otra vez.
    const antesCaja = await caja();
    const antesBolsillo = await bolsillos();
    await request
      .post(`/fixed-costs/${creado.body.id}/payment`)
      .set(auth())
      .field('periodYear', '2026')
      .field('periodMonth', '5')
      .field('cashAmount', '0')
      .field('bankAmount', '800000')
      .attach('proof', PNG, 'comprobante.png')
      .expect(201);

    const pagado = await resultado();
    expect(pagado.netResult).toBeCloseTo(conCosto.netResult, 2);
    expect(pagado.totalFixed).toBeCloseTo(conCosto.totalFixed, 2);

    // La caja y el bolsillo sí se movieron.
    const despuesCaja = await caja();
    const despuesBolsillo = await bolsillos();
    expect(despuesCaja.paid.fixedCosts - antesCaja.paid.fixedCosts).toBeCloseTo(800_000, 2);
    expect(antesBolsillo.bank.balance - despuesBolsillo.bank.balance).toBeCloseTo(800_000, 2);
  });

  it('L5 · anular un pago de nómina devuelve la plata al bolsillo y la deuda a pendiente', async () => {
    // Sin este camino, un pago cargado por error quedaba restando del bolsillo
    // para siempre y el empleado figuraba cobrado.
    const pagos = await prisma.payrollWeekPayment.findMany({
      where: { status: 'PAID' },
      select: { id: true, cashAmount: true, bankAmount: true },
    });
    expect(pagos.length).toBeGreaterThan(0);
    const pago = pagos[0]!;
    const monto = Number(pago.cashAmount) + Number(pago.bankAmount);

    const antesResultado = await resultado();
    const antesCaja = await caja();
    const antesBolsillo = await bolsillos();

    await request
      .post(`/workers/weekly/payment/${pago.id}/void`)
      .set(auth())
      .send({ reason: 'Cargado por error' })
      .expect(201);

    const despuesResultado = await resultado();
    const despuesCaja = await caja();
    const despuesBolsillo = await bolsillos();

    // El trabajo sigue devengado: anular el PAGO no borra el costo.
    expect(despuesResultado.netResult).toBeCloseTo(antesResultado.netResult, 2);
    // La plata vuelve al bolsillo y la deuda a pendiente.
    expect(antesCaja.paid.payroll - despuesCaja.paid.payroll).toBeCloseTo(monto, 2);
    expect(despuesCaja.pending.payroll - antesCaja.pending.payroll).toBeCloseTo(monto, 2);
    expect(despuesBolsillo.total - antesBolsillo.total).toBeCloseTo(monto, 2);
  });
});
