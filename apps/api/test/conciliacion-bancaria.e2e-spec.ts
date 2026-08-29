/**
 * conciliacion-bancaria.e2e-spec.ts — el emparejamiento del extracto.
 *
 * El PARSER del CSV ya tenía tests (`parse-csv.test.ts`). Lo que no tenía NADA
 * —ni unit ni e2e— era la lógica que decide qué queda `matched`, qué queda
 * `unmatched_csv` y qué `unmatched_sale`. O sea: **la que levanta la bandera de
 * fraude**. Y no es trivial: empareja de forma golosa por monto con una ventana
 * de ±24 h, así que un orden equivocado empareja el abono que no era y deja
 * limpia una venta que no lo está.
 *
 * Qué significa cada bandera:
 *  - `unmatched_csv`  → el banco recibió plata que el POS no registró.
 *  - `unmatched_sale` → el POS dice que cobraron por transferencia y al banco
 *                       nunca llegó.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

interface FilaReporte {
  status: 'matched' | 'unmatched_csv' | 'unmatched_sale';
  csvAmount: number | null;
  saleTotal: number | null;
  receiptNumber: number | null;
}
interface Reporte {
  summary: { matched: number; unmatchedCsv: number; unmatchedSale: number };
  rows: FilaReporte[];
}

describe('Conciliación bancaria: el emparejamiento del extracto E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let productId: string;

  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

  /** Fecha del extracto en YYYY-MM-DD (día calendario LOCAL, como el banco). */
  const ymd = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const csv = (filas: Array<{ fecha: string; monto: number; ref: string }>): string =>
    ['fecha,monto,referencia', ...filas.map((f) => `${f.fecha},${f.monto},${f.ref}`)].join('\n');

  /** Sube el extracto y devuelve el reporte. */
  const conciliar = async (texto: string, source = 'BANCOLOMBIA_CSV'): Promise<Reporte> => {
    const res = await request
      .post(`/reports/payment-reconciliation/import?source=${source}`)
      .set(auth())
      .attach('file', Buffer.from(texto, 'utf8'), 'extracto.csv')
      .expect(201);
    return res.body as Reporte;
  };

  /**
   * Cobra una venta con los pagos indicados y la fecha de pago dada. `paidAt`
   * se fuerza en la base: el emparejamiento mira ESA fecha contra la del
   * extracto, y necesitamos controlarla para probar la ventana de tolerancia.
   */
  const venderDigital = async (
    partes: Array<{ method: string; amount: number }>,
    paidAt: Date,
  ): Promise<{ saleId: string; receiptNumber: number }> => {
    const total = partes.reduce((a, p) => a + p.amount, 0);
    const creada = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: total / 1000 }] })
      .expect(201);
    const saleId = creada.body.id as string;

    const cuerpo =
      partes.length === 1
        ? { method: partes[0]!.method, amountReceived: total, digitalDoubleVerified: true }
        : { payments: partes.map((p) => ({ ...p, digitalVerified: true })) };
    await request.post(`/sales/${saleId}/confirm-payment`).set(auth()).send(cuerpo).expect(201);

    await prisma.sale.update({ where: { id: saleId }, data: { paidAt } });
    return { saleId, receiptNumber: Number(creada.body.receiptNumber) };
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-concilia@test.local',
        fullName: 'Dueño Conciliación',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-concilia@test.local');

    // Producto a $1.000 la unidad: el total de la venta se elige con la
    // cantidad y las cuentas del extracto quedan a la vista.
    productId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Bebidas',
          name: 'Gaseosa Concilia',
          basePrice: 1000,
          directResale: true,
          unitPurchase: 'caja',
          unitStock: 'unidad',
          conversionFactor: 24,
          thresholdMin: 0,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({
        entityType: 'PRODUCT',
        productId,
        delta: 10_000,
        type: 'INITIAL',
        unitCost: 300,
      })
      .expect(201);

    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterEach(async () => {
    // Cada caso arma su propio escenario: una venta de otro caso emparejaría
    // con el extracto de este y el resultado dependería del orden.
    // TRUNCATE y no deleteMany: `sale_status_log` es insert-only por trigger de
    // base (§4.4) y rechaza el DELETE. TRUNCATE no pasa por ese trigger.
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE sale_payments, sale_status_log, sale_items, sales CASCADE',
    );
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('una transferencia que está en el POS y en el banco queda emparejada', async () => {
    const hoy = new Date();
    await venderDigital([{ method: 'TRANSFER', amount: 25_000 }], hoy);

    const r = await conciliar(csv([{ fecha: ymd(hoy), monto: 25_000, ref: 'abono1' }]));

    expect(r.summary).toEqual({ matched: 1, unmatchedCsv: 0, unmatchedSale: 0 });
    expect(r.rows[0]!.saleTotal).toBe(25_000);
  });

  it('plata en el banco que el POS nunca registró queda marcada', async () => {
    // La bandera que importa: entró plata a la cuenta y no hay venta detrás.
    const hoy = new Date();
    const r = await conciliar(csv([{ fecha: ymd(hoy), monto: 88_000, ref: 'sin-venta' }]));

    expect(r.summary.unmatchedCsv).toBe(1);
    expect(r.summary.matched).toBe(0);
    expect(r.rows[0]!.status).toBe('unmatched_csv');
    expect(r.rows[0]!.receiptNumber).toBeNull();
  });

  it('una venta cobrada por transferencia que nunca llegó al banco queda marcada', async () => {
    // La otra bandera: el cajero dio por buena una transferencia que no entró.
    const hoy = new Date();
    await venderDigital([{ method: 'TRANSFER', amount: 41_000 }], hoy);

    // El extracto trae otro abono cualquiera, no el de esa venta.
    const r = await conciliar(csv([{ fecha: ymd(hoy), monto: 7_000, ref: 'otro' }]));

    expect(r.summary.unmatchedSale).toBe(1);
    const sinBanco = r.rows.find((x) => x.status === 'unmatched_sale');
    expect(sinBanco?.saleTotal).toBe(41_000);
  });

  it('una cuenta dividida en dos transferencias empareja cada parte con su abono', async () => {
    // El banco ve DOS movimientos, no uno: la unidad de emparejamiento es el
    // pago, no la venta. Si se emparejara por el total, las dos partes
    // quedarían marcadas y la venta entera parecería sospechosa.
    const hoy = new Date();
    await venderDigital(
      [
        { method: 'TRANSFER', amount: 12_000 },
        { method: 'TRANSFER', amount: 18_000 },
      ],
      hoy,
    );

    const r = await conciliar(
      csv([
        { fecha: ymd(hoy), monto: 12_000, ref: 'parte1' },
        { fecha: ymd(hoy), monto: 18_000, ref: 'parte2' },
      ]),
    );

    expect(r.summary).toEqual({ matched: 2, unmatchedCsv: 0, unmatchedSale: 0 });
  });

  it('un mismo pago no empareja dos abonos del banco', async () => {
    // Dos abonos del mismo monto y una sola venta: uno empareja y el otro
    // queda marcado. Sin ese candado, un cobro duplicado en el banco pasaría
    // desapercibido — que es justo el caso que hay que ver.
    const hoy = new Date();
    await venderDigital([{ method: 'TRANSFER', amount: 30_000 }], hoy);

    const r = await conciliar(
      csv([
        { fecha: ymd(hoy), monto: 30_000, ref: 'abono' },
        { fecha: ymd(hoy), monto: 30_000, ref: 'abono-repetido' },
      ]),
    );

    expect(r.summary.matched).toBe(1);
    expect(r.summary.unmatchedCsv).toBe(1);
  });

  it('un pago de hace tres días no empareja con el abono de hoy', async () => {
    // La tolerancia es de ±24 h. Sin ese límite, dos operaciones del mismo
    // monto en semanas distintas se emparejarían entre sí y las dos banderas
    // reales se apagarían a la vez.
    const hoy = new Date();
    const haceTresDias = new Date(hoy.getTime() - 3 * 24 * 60 * 60 * 1000);
    await venderDigital([{ method: 'TRANSFER', amount: 55_000 }], haceTresDias);

    const r = await conciliar(csv([{ fecha: ymd(hoy), monto: 55_000, ref: 'abono-hoy' }]));

    expect(r.summary.matched).toBe(0);
    expect(r.summary.unmatchedCsv).toBe(1);
  });

  it('el efectivo no entra a la conciliación: el banco no lo ve', async () => {
    const hoy = new Date();
    await venderDigital([{ method: 'CASH', amount: 19_000 }], hoy);

    const r = await conciliar(csv([{ fecha: ymd(hoy), monto: 4_000, ref: 'ajeno' }]));

    // Ni empareja ni se marca como venta sin abono: no le corresponde estar.
    expect(r.summary.unmatchedSale).toBe(0);
    expect(r.rows.every((x) => x.saleTotal !== 19_000)).toBe(true);
  });

  it('la venta de la NOCHE del último día del extracto también se revisa', async () => {
    // Regresión de la auditoría 2026-07-05: la ventana se cerraba en la fecha
    // cruda del CSV (medianoche UTC), así que toda venta de la tarde-noche del
    // último día quedaba FUERA y escapaba del flag — justo las horas en las que
    // este negocio vende.
    const hoy = new Date();
    const nocheDeHoy = new Date(hoy);
    nocheDeHoy.setHours(22, 30, 0, 0);
    await venderDigital([{ method: 'TRANSFER', amount: 33_000 }], nocheDeHoy);

    const r = await conciliar(csv([{ fecha: ymd(hoy), monto: 1_000, ref: 'otro' }]));

    expect(r.summary.unmatchedSale).toBe(1);
  });

  it('un extracto de Nequi no empareja contra transferencias bancarias', async () => {
    // Cada fuente conoce sus métodos (catálogo de medios de pago). Emparejar
    // entre fuentes daría por conciliado un abono que está en otra cuenta.
    const hoy = new Date();
    await venderDigital([{ method: 'TRANSFER', amount: 21_000 }], hoy);

    const r = await conciliar(
      csv([{ fecha: ymd(hoy), monto: 21_000, ref: 'nequi' }]),
      'NEQUI_CSV',
    );

    expect(r.summary.matched).toBe(0);
    expect(r.summary.unmatchedCsv).toBe(1);
  });

  it('un CSV vacío se rechaza con un mensaje, no con un reporte en cero', async () => {
    // Un reporte de ceros se lee como "todo cuadra". Es la respuesta más
    // peligrosa posible para un archivo que no se pudo leer.
    await request
      .post('/reports/payment-reconciliation/import?source=BANCOLOMBIA_CSV')
      .set(auth())
      .attach('file', Buffer.from('fecha,monto,referencia\n', 'utf8'), 'vacio.csv')
      .expect(400);
  });
});
