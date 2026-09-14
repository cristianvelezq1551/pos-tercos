/**
 * §4.6: los reportes financieros del dueño (`/reports/financial/monthly`,
 * `/reports/dashboard`) no tenían asserts de MONTOS — el dueño decide con
 * números que nadie verificaba. Cubre por DELTA (robusto a datos previos): una
 * venta conocida mueve revenue y COGS lo esperado, y el estado financiero expone
 * las líneas de Fase 1 (wasteCost restado del neto, cogsEstimated).
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { hoyLocal } from './helpers/local-day';

describe('Reportes financieros del dueño E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let productId: string;
  let cogs: CogsService;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const now = new Date();

  const monthly = async (year = now.getFullYear(), month = now.getMonth() + 1) => {
    // El ledger FIFO tiene caché TTL 60s (staleness deliberada de los reportes).
    // En el test invalidamos para leer FRESCO tras cada movimiento — igual que
    // ledger-snapshot.e2e; en prod lo refresca el cron/snapshot o el paso del TTL.
    cogs.invalidateLedgerCache();
    return (await request.get(`/reports/financial/monthly?year=${year}&month=${month}`).set(auth()).expect(200))
      .body as {
      revenue: number; discountTotal: number; grossRevenue: number;
      cogs: number; grossMargin: number; grossMarginPct: number;
      netResult: number; wasteCost: number; cortesiasCost: number; refundCost: number;
      totalFixed: number; oneTimeCost: number; breakEvenBase: number; monthLossesCost?: number; breakEven: number | null;
      breakEvenCoverage: number | null;
      catalogBreakEven: {
        target: number | null;
        marginPct: number | null;
        weightedBySales: boolean;
        productsConsidered: number;
        productsWithoutCost: number;
        worst: { name: string; marginPct: number } | null;
        best: { name: string; marginPct: number } | null;
        coverage: number | null;
      };
      contributionMargin: number; contributionMarginPct: number | null;
      deliveryCollected: number; deliveryOrderCount: number;
      freightCost: number; freightInvoiceCount: number; purchasedTotal: number;
      payablesPaidCost: number; payablesPaidCount: number;
      salesCount: number;
      fixedCosts: Array<{ name: string; monthlyAmount: number; isPayroll: boolean; isOneTime: boolean; isEstimated: boolean }>;
      cogsEstimated: boolean; cogsPartial: boolean;
      periodStatus?: 'future' | 'in_progress' | 'closed';
      periodDaysElapsed?: number; periodDaysTotal?: number;
      projectedRevenue?: number | null; projectedNet?: number | null;
    };
  };

  const dashboardRevenue = async () =>
    (await request.get('/reports/dashboard').set(auth()).expect(200)).body.todayRevenue as number;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Auto-aislada: no confiar en que la suite anterior limpió. Esta suite lee
    // agregados GLOBALES (reportes / ledger de inventario), así que un residuo
    // de otra suite mueve los números y el fallo depende del orden de archivos.
    await cleanDb(prisma);
    cogs = app.get(CogsService);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: { email: 'dueno-fr@test.local', fullName: 'Dueño FR', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
    });
    token = await loginAs(request, 'dueno-fr@test.local');
    const prod = await request
      .post('/products')
      .set(auth())
      .send({ category: 'Test', name: 'Coca FR', basePrice: 5000, directResale: true, unitPurchase: 'caja', unitStock: 'unit', conversionFactor: 24, modifiersEnabled: false })
      .expect(201);
    productId = prod.body.id as string;
    // Stock con costo FIFO conocido: 10 unidades a $1.500 c/u.
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: 10, type: 'INITIAL', unitCost: 1500 })
      .expect(201);
    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('una venta conocida mueve revenue (+$5.000) y COGS (+$1.500) en el P&G del mes y el dashboard', async () => {
    const mBefore = await monthly();
    const dashBefore = await dashboardRevenue();

    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
      .expect(201);
    await request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: 5000 })
      .expect(201);

    const mAfter = await monthly();
    expect(mAfter.revenue - mBefore.revenue).toBe(5000);
    // COGS FIFO de la unidad vendida: $1.500.
    expect(mAfter.cogs - mBefore.cogs).toBe(1500);
    // El neto sube en (revenue − cogs) por esta venta (sin otros gastos nuevos).
    expect(mAfter.netResult - mBefore.netResult).toBe(5000 - 1500);
    expect(await dashboardRevenue() - dashBefore).toBe(5000);

    // §1.2/§1.12: las líneas nuevas del estado financiero están presentes.
    expect(typeof mAfter.wasteCost).toBe('number');
    expect(typeof mAfter.cogsEstimated).toBe('boolean');
  });

  it('la merma se resta del neto (§1.2) sin tocar el revenue', async () => {
    const before = await monthly();
    // Merma de 2 unidades a $1.500 = $3.000 (WASTE).
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: -2, type: 'WASTE', notes: 'se cayó la caja' })
      .expect(201);
    const after = await monthly();

    expect(after.revenue).toBe(before.revenue); // la merma NO es ingreso
    expect(after.wasteCost - before.wasteCost).toBe(3000);
    // El neto BAJA por la merma (decisión del dueño: la merma resta).
    expect(after.netResult - before.netResult).toBe(-3000);
  });
  it('anular una merma mal registrada la borra del neto (queda solo lo que se tiró)', async () => {
    const before = await monthly();
    // El cocinero teclea 4 unidades cuando en realidad se cayó 1.
    const merma = await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: -4, type: 'WASTE', notes: 'dedo pesado' })
      .expect(201);
    const conMerma = await monthly();
    expect(conMerma.wasteCost - before.wasteCost).toBe(6000); // 4 × $1.500

    // El dueño devuelve las 3 que nunca se tiraron.
    await request
      .post(`/inventory/movements/${merma.body.id}/reverse-waste`)
      .set(auth())
      .send({ reason: 'Fue una unidad, no cuatro', quantity: 3 })
      .expect(201);

    const after = await monthly();
    // Pérdida real: 1 × $1.500. Sin la reversa, el P&G arrastraba $6.000 para siempre.
    expect(after.wasteCost - before.wasteCost).toBe(1500);
    expect(after.netResult - before.netResult).toBe(-1500);
    expect(after.revenue).toBe(before.revenue);
  });

  it('un salario MENSUAL entra completo como "Nómina (mes completo)" y baja el neto', async () => {
    const before = await monthly();
    const SALARIO = 3_000_000;
    // Contratado antes del mes y sin salida ⇒ el mes se devenga entero.
    await prisma.user.create({
      data: {
        email: 'mensual-fr@test.local',
        fullName: 'Empleado Mensual',
        role: 'TRABAJADOR',
        passwordHash: 'x',
        mustChangePwd: false,
        active: true,
        payType: 'MONTHLY',
        salaryAmount: SALARIO,
        hireDate: new Date(Date.UTC(now.getFullYear() - 1, 0, 1)),
      },
    });

    const after = await monthly();
    // Suma exacta del salario: el prorrateo por día debe cerrar en el mes completo,
    // sea de 28, 30 o 31 días.
    expect(after.totalFixed - before.totalFixed).toBe(SALARIO);
    expect(after.netResult - before.netResult).toBe(-SALARIO);
    const nomina = after.fixedCosts.find((l) => l.isPayroll);
    expect(nomina?.monthlyAmount).toBe(SALARIO);
  });

  it('un empleado que se fue antes del mes NO devenga nada', async () => {
    const before = await monthly();
    await prisma.user.create({
      data: {
        email: 'retirado-fr@test.local',
        fullName: 'Ya no trabaja acá',
        role: 'TRABAJADOR',
        passwordHash: 'x',
        mustChangePwd: false,
        active: false,
        payType: 'MONTHLY',
        salaryAmount: 2_000_000,
        hireDate: new Date(Date.UTC(now.getFullYear() - 2, 0, 1)),
        terminationDate: new Date(Date.UTC(now.getFullYear() - 1, 0, 31)),
      },
    });
    const after = await monthly();
    expect(after.totalFixed).toBe(before.totalFixed);
    expect(after.netResult).toBe(before.netResult);
  });

  it('un costo fijo recurrente baja el neto y entra al equilibrio; uno puntual también entra a la base', async () => {
    const before = await monthly();
    const ARRIENDO = 1_500_000;
    await request
      .post('/fixed-costs')
      .set(auth())
      .send({ name: 'Arriendo', amount: ARRIENDO, frequency: 'MONTHLY', category: 'Local' })
      .expect(201);

    const conArriendo = await monthly();
    expect(conArriendo.totalFixed - before.totalFixed).toBe(ARRIENDO);
    expect(conArriendo.netResult - before.netResult).toBe(-ARRIENDO);

    // Gasto puntual: pega al neto, se reporta aparte de lo recurrente, y desde
    // 2026-09-11 SÍ entra a la base del equilibrio: también hay que pagarlo con
    // las ventas de este mes (decisión del dueño).
    const COMPRA_HORNO = 800_000;
    const hoy = hoyLocal();
    await request
      .post('/fixed-costs')
      .set(auth())
      .send({ name: 'Horno nuevo', amount: COMPRA_HORNO, frequency: 'ONE_TIME', category: 'Equipos', startedAt: hoy })
      .expect(201);

    const after = await monthly();
    expect(after.oneTimeCost - conArriendo.oneTimeCost).toBe(COMPRA_HORNO);
    expect(after.totalFixed).toBe(conArriendo.totalFixed); // el puntual NO es recurrente
    expect(after.breakEvenBase - conArriendo.breakEvenBase).toBe(COMPRA_HORNO);
    expect(after.breakEvenBase).toBeCloseTo(after.totalFixed + after.oneTimeCost + after.payablesPaidCost, 2);
    expect(after.netResult - conArriendo.netResult).toBe(-COMPRA_HORNO);

    // Break-even = costos recurrentes / margen de CONTRIBUCIÓN % (auditoría
    // 2026-07-25). El margen BRUTO ignoraba merma, cortesías y reembolsos —que
    // suben con la venta— y daba un equilibrio más bajo que el real. Acá el
    // escenario tiene merma acumulada de tests previos, así que la diferencia
    // entre las dos fórmulas es justamente lo que se está probando.
    expect(after.contributionMargin).toBeCloseTo(
      after.revenue - after.cogs - after.wasteCost - after.cortesiasCost - after.refundCost,
      2,
    );
    if (after.contributionMarginPct !== null && after.contributionMarginPct > 0) {
      expect(after.breakEven).toBeCloseTo(after.breakEvenBase / after.contributionMarginPct, 0);
      // Nunca es menor que el que salía del margen bruto.
      expect(after.breakEven!).toBeGreaterThanOrEqual(
        after.breakEvenBase / after.grossMarginPct - 0.01,
      );
    } else {
      // Margen de contribución ≤ 0: NO hay volumen que cubra los fijos, y el
      // reporte lo dice con null en vez de inventar un número.
      expect(after.breakEven).toBeNull();
      expect(after.breakEvenCoverage).toBeNull();
    }
  });

  // ==================================================================
  // El monto de un costo fijo es el PAGADO cuando ya se pagó (Fase 1 del
  // plan de estado financiero, 2026-09-11). Antes salía siempre el
  // configurado en la ficha: el recibo real de la luz nunca llegaba al
  // estado, y corregir la ficha reescribía todos los meses anteriores.
  // ==================================================================

  describe('el monto de un costo fijo es lo pagado cuando ya se pagó', () => {
    // 1×1 PNG válido (mismo fixture que fixed-costs.e2e).
    const PNG_1X1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const siguiente = new Date(y, m, 1); // mes siguiente (JS: month0 = m)
    const yN = siguiente.getFullYear();
    const mN = siguiente.getMonth() + 1;

    const linea = (s: Awaited<ReturnType<typeof monthly>>, name: string) => {
      const l = s.fixedCosts.find((c) => c.name === name);
      if (!l) throw new Error(`no hay línea ${name}`);
      return l;
    };
    const crear = async (body: Record<string, unknown>) =>
      (await request.post('/fixed-costs').set(auth()).send(body).expect(201)).body.id as string;
    const pagar = (id: string, year: number, month: number, amount: number) =>
      request
        .post(`/fixed-costs/${id}/payment`)
        .set(auth())
        .field('periodYear', String(year))
        .field('periodMonth', String(month))
        .field('amount', String(amount))
        .field('cashAmount', '0')
        .field('bankAmount', String(amount))
        .attach('proof', PNG_1X1, 'proof.png')
        .expect(201);

    it('mensual: sin pago es la ficha marcada estimado; con pago, lo pagado; el mes siguiente sigue estimado', async () => {
      const antes = await monthly();
      const id = await crear({ name: 'Servicios F1', amount: 900_000, frequency: 'MONTHLY', category: 'Servicios' });

      const sinPago = await monthly();
      expect(linea(sinPago, 'Servicios F1')).toMatchObject({ monthlyAmount: 900_000, isEstimated: true });
      expect(sinPago.totalFixed - antes.totalFixed).toBe(900_000);

      await pagar(id, y, m, 1_150_000);
      const conPago = await monthly();
      expect(linea(conPago, 'Servicios F1')).toMatchObject({ monthlyAmount: 1_150_000, isEstimated: false });
      expect(conPago.totalFixed - sinPago.totalFixed).toBe(250_000);
      expect(conPago.netResult - sinPago.netResult).toBe(-250_000);

      // El mes siguiente no tiene pago: vuelve a la ficha, estimado.
      const proximo = await monthly(yN, mN);
      expect(linea(proximo, 'Servicios F1')).toMatchObject({ monthlyAmount: 900_000, isEstimated: true });

      // Corregir la ficha NO reescribe el mes ya pagado; sí el que no.
      await request.patch(`/fixed-costs/${id}`).set(auth()).send({ amount: 950_000 }).expect(200);
      expect(linea(await monthly(), 'Servicios F1')).toMatchObject({ monthlyAmount: 1_150_000, isEstimated: false });
      expect(linea(await monthly(yN, mN), 'Servicios F1')).toMatchObject({ monthlyAmount: 950_000, isEstimated: true });

      // Desmarcar el pago devuelve la línea a la ficha, estimada otra vez.
      await request.delete(`/fixed-costs/${id}/payment?year=${y}&month=${m}`).set(auth()).expect(200);
      expect(linea(await monthly(), 'Servicios F1')).toMatchObject({ monthlyAmount: 950_000, isEstimated: true });
    });

    it('anual: el pago de enero se reparte ÷12; puntual: usa el pago de su propio mes', async () => {
      const seguro = await crear({ name: 'Seguro F1', amount: 1_200_000, frequency: 'ANNUAL', category: 'Otros' });
      expect(linea(await monthly(), 'Seguro F1')).toMatchObject({ monthlyAmount: 100_000, isEstimated: true });
      await pagar(seguro, y, 1, 1_500_000);
      expect(linea(await monthly(), 'Seguro F1')).toMatchObject({ monthlyAmount: 125_000, isEstimated: false });

      const antes = await monthly();
      const horno = await crear({
        name: 'Horno F1', amount: 800_000, frequency: 'ONE_TIME', category: 'Equipos', startedAt: hoyLocal(),
      });
      const sinPago = await monthly();
      expect(linea(sinPago, 'Horno F1')).toMatchObject({ monthlyAmount: 800_000, isOneTime: true, isEstimated: true });
      expect(sinPago.oneTimeCost - antes.oneTimeCost).toBe(800_000);
      await pagar(horno, y, m, 850_000);
      const conPago = await monthly();
      expect(linea(conPago, 'Horno F1')).toMatchObject({ monthlyAmount: 850_000, isOneTime: true, isEstimated: false });
      expect(conPago.oneTimeCost - sinPago.oneTimeCost).toBe(50_000);
      // Un puntual nunca entra a lo recurrente, pagado o no.
      expect(conPago.totalFixed).toBe(sinPago.totalFixed);
    });

    it('la nómina automática nunca se rotula estimada', async () => {
      const s = await monthly();
      for (const l of s.fixedCosts) {
        if (l.isPayroll) expect(l.isEstimated).toBe(false);
      }
    });
  });

  // ==================================================================
  // Aviso de margen de contribución negativo
  //
  // Un mes donde cada venta pierde plata es justo el que el dueño no debería
  // descubrir el día 30. El aviso se empuja por WhatsApp, pero SOLO si el mes
  // tiene actividad real y una vez por mes: una alerta ruidosa se ignora.
  // ==================================================================

  const checkMargin = async () =>
    (await request.post('/reports/admin/check-contribution-margin').set(auth()).expect(201))
      .body as { sent: boolean; reason?: string; contributionMargin?: number };

  it('con pocas ventas NO avisa, aunque el margen sea negativo', async () => {
    // El escenario acumulado tiene 1 venta de $5.000 y $4.500 de merma → el
    // margen ya es negativo, pero una merma sobre un puñado de tickets no dice
    // nada del negocio.
    const st = await monthly();
    expect(st.contributionMargin).toBeLessThan(0);
    expect(st.salesCount).toBeLessThan(20);

    const res = await checkMargin();
    expect(res.sent).toBe(false);
    expect(res.reason).toContain('mínimo 20');
  });

  it('con actividad real avisa UNA vez, y no repite el mismo mes', async () => {
    // Stock para vender y para mermar sin dejar el inventario en negativo.
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: 200, type: 'MANUAL_ADJUSTMENT', unitCost: 1500 })
      .expect(201);
    // Se llega al mínimo de ventas manteniendo el margen negativo: cada venta
    // deja $3.500, y la merma acumulada ($4.500) más otra grande la supera.
    for (let i = 0; i < 25; i++) {
      const sale = await request
        .post('/sales')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(201);
      await request
        .post(`/sales/${sale.body.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 5000 })
        .expect(201);
    }
    // Merma que se come todo el margen del mes (una nevera dañada, p. ej.).
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: -80, type: 'WASTE', notes: 'se dañó la nevera' })
      .expect(201);

    const st = await monthly();
    expect(st.salesCount).toBeGreaterThanOrEqual(20);
    expect(st.contributionMargin).toBeLessThan(0);
    expect(st.breakEven).toBeNull(); // no hay equilibrio posible

    const primera = await checkMargin();
    expect(primera.sent).toBe(true);
    expect(primera.contributionMargin).toBe(st.contributionMargin);

    // Queda en la bitácora con los números que lo motivaron.
    const log = await prisma.auditLog.findFirst({
      where: { action: 'OWNER_MARGIN_ALERT_SENT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log!.metadata)).toContain('contributionMargin');

    // Segundo intento el mismo mes: no repite (si no, avisaría todas las noches).
    const segunda = await checkMargin();
    expect(segunda.sent).toBe(false);
    expect(segunda.reason).toContain('ya se avisó');
  });

  it('con margen positivo no avisa nada', async () => {
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: 200, type: 'MANUAL_ADJUSTMENT', unitCost: 1500 })
      .expect(201);
    // Se levanta el margen vendiendo: las ventas dejan $3.500 cada una y la
    // merma del mes ya está fija, así que el acumulado se vuelve positivo.
    for (let i = 0; i < 40; i++) {
      const sale = await request
        .post('/sales')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(201);
      await request
        .post(`/sales/${sale.body.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 5000 })
        .expect(201);
    }
    const st = await monthly();
    expect(st.contributionMargin).toBeGreaterThan(0);

    const res = await checkMargin();
    expect(res.sent).toBe(false);
    expect(res.reason).toContain('no es negativo');
  });

  it('el estado financiero cierra: neto = margen bruto − fijos − puntuales − cortesías − reembolsos − merma − fletes − compromisos', async () => {
    const m = await monthly();
    expect(m.grossMargin).toBeCloseTo(m.revenue - m.cogs, 2);
    const esperado =
      m.grossMargin -
      m.totalFixed -
      m.oneTimeCost -
      m.cortesiasCost -
      m.refundCost -
      m.wasteCost -
      m.freightCost -
      m.payablesPaidCost;
    // Es LA identidad del reporte: si esto se rompe, el dueño decide con un
    // número que no corresponde a ninguna suma.
    expect(m.netResult).toBeCloseTo(esperado, 2);
  });

  // Va al FINAL a propósito: agrega una venta y los tests de alerta de margen de
  // arriba leen el acumulado del mes (una venta rentable de más les da vuelta al
  // signo del margen de contribución).
  it('un descuento del cajero baja el ingreso y queda visible como línea del P&G', async () => {
    const before = await monthly();

    // $5.000 con 20% de descuento = cobra $4.000 y regala $1.000.
    const sale = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'COUNTER',
        items: [{ productId, quantity: 1 }],
        orderDiscount: { kind: 'PERCENT', value: 20 },
        discountReason: 'Cliente frecuente',
      })
      .expect(201);
    await request
      .post(`/sales/${sale.body.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'CASH', amountReceived: 4000 })
      .expect(201);

    const after = await monthly();
    // El ingreso entra NETO: lo descontado nunca se cobró, no es ingreso.
    expect(after.revenue - before.revenue).toBe(4000);
    // Y el descuento queda explícito: sin esta línea el dueño no ve qué regaló.
    expect(after.discountTotal - before.discountTotal).toBe(1000);
    expect(after.grossRevenue - before.grossRevenue).toBe(5000);
    expect(after.grossRevenue).toBe(after.revenue + after.discountTotal);
  });

  // Solo lecturas con params rotos: no mueven los acumulados del mes que los
  // tests de arriba miden por delta.
  /**
   * Domicilio de compra: lo que cobra el proveedor por traer la mercancía.
   *
   * Es el caso que motivó el campo. Antes, ese gasto no aparecía en NINGUNA
   * línea del P&G: se pagaba, salía de Tesorería, y el resultado neto quedaba
   * inflado exactamente en esa plata. Acá se verifica que baja el neto SIN
   * ensuciar el COGS — el flete no encarece ningún producto.
   *
   * Va al final porque confirmar una factura crea un lote FIFO nuevo y mueve
   * `purchasedTotal`, que los tests de arriba leen como acumulado del mes.
   */
  it('el domicilio de una factura baja el neto y NO entra al COGS', async () => {
    const before = await monthly();

    const FLETE = 9_000;
    const MERCANCIA = 60_000;
    const draft = await prisma.invoice.create({
      data: {
        status: 'PENDING_REVIEW',
        aiModelUsed: 'test-mock',
        aiExtractionJson: {},
        uploadedById: (await prisma.user.findFirstOrThrow({ where: { email: 'dueno-fr@test.local' } })).id,
      },
    });

    await request
      .post(`/invoices/${draft.id}/confirm`)
      .set(auth())
      .send({
        supplierNit: '900999888-1',
        supplierName: 'Proveedor con domicilio',
        total: MERCANCIA + FLETE,
        freight: FLETE,
        items: [
          {
            entityType: 'PRODUCT',
            productId,
            descriptionRaw: 'Coca FR caja',
            quantity: 1,
            unit: 'caja',
            unitPrice: MERCANCIA,
            total: MERCANCIA,
          },
        ],
      })
      .expect(201);

    const after = await monthly();

    // El flete aparece como su propia línea, con su factura contada.
    expect(after.freightCost - before.freightCost).toBeCloseTo(FLETE, 2);
    expect(after.freightInvoiceCount - before.freightInvoiceCount).toBe(1);
    // Y la mercancía queda como contexto (para el % de flete), sin el flete.
    expect(after.purchasedTotal - before.purchasedTotal).toBeCloseTo(MERCANCIA, 2);

    // Lo esencial: comprar no consume nada, así que el COGS del mes no se mueve
    // NI por la mercancía (es inventario hasta que se venda) ni por el flete.
    expect(after.cogs).toBeCloseTo(before.cogs, 2);
    expect(after.revenue).toBeCloseTo(before.revenue, 2);
    expect(after.grossMargin).toBeCloseTo(before.grossMargin, 2);

    // Pero el neto SÍ baja: es plata que se pagó y no vuelve.
    expect(before.netResult - after.netResult).toBeCloseTo(FLETE, 2);

    // Y el margen de contribución también, porque el flete es variable.
    expect(before.contributionMargin - after.contributionMargin).toBeCloseTo(FLETE, 2);
  });

  describe('validación de ?year=&month= y ?from=&to=', () => {
    it('month fuera de rango → 400', async () => {
      // Bug: month=13 rebalsaba en silencio a enero del año siguiente (rollover de new Date) y el dueño leía otro mes.
      await request
        .get(`/reports/financial/monthly?year=${now.getFullYear()}&month=13`)
        .set(auth())
        .expect(400);
    });

    it('month no numérico → 400', async () => {
      // Bug: month=abc terminaba en un 500 de Prisma con Invalid Date.
      await request
        .get(`/reports/financial/monthly?year=${now.getFullYear()}&month=abc`)
        .set(auth())
        .expect(400);
    });

    it('un from presente pero mal formado → 400 (no degrada a "hoy")', async () => {
      // Bug: parseDateRange ignoraba en silencio un from inválido y devolvía "hoy" a quien creía haber pedido julio.
      await request
        .get('/reports/sales-summary?from=2026/07/01')
        .set(auth())
        .expect(400);
    });
  });

  /**
   * El equilibrio que ve el dueño sale del margen de la CARTA, no del realizado
   * del mes (§7.v52): el realizado es correcto pero con poco volumen salta —
   * $92.000 vendidos con $34.000 de flete se llevan 37 puntos.
   *
   * Y verifica lo que NO se puede dar por sentado: el costo se calcula ahora
   * con UN grafo para toda la carta en vez de una llamada a `expandedCost` por
   * producto. Son las mismas funciones puras, pero si alguna vez se separan,
   * el equilibrio y la ficha del producto dirían costos distintos.
   */
  describe('punto de equilibrio con el margen de la carta', () => {
    it('coincide con el costo que muestra la ficha del producto', async () => {
      const m = await monthly();
      const ficha = (
        await request.get(`/products/${productId}/expanded-cost`).set(auth()).expect(200)
      ).body as { totalCost: number | null };

      // No se afirma un costo absoluto: lo que importa es que las DOS pantallas
      // digan lo mismo. El precio de Coca FR es $5.000 y su costo sale del
      // catálogo, así que el margen del equilibrio tiene que ser exactamente el
      // que se deduce de la ficha.
      expect(ficha.totalCost).not.toBeNull();
      expect(m.catalogBreakEven.marginPct).toBeCloseTo((5000 - ficha.totalCost!) / 5000, 4);
      expect(m.catalogBreakEven.productsConsidered).toBe(1);
      expect(m.catalogBreakEven.productsWithoutCost).toBe(0);
    });

    it('vendiendo el equilibrio, el margen de la carta cubre exactamente la base (fijos + únicos + compromisos)', async () => {
      await request
        .post('/fixed-costs')
        .set(auth())
        .send({ name: 'Arriendo test', category: 'Alquiler', amount: 700_000, frequency: 'MONTHLY' })
        .expect(201);

      const m = await monthly();
      expect(m.totalFixed).toBeGreaterThanOrEqual(700_000);
      expect(m.catalogBreakEven.target).not.toBeNull();
      // La ley: target × margen = costos fijos. Con 70 % de margen, $700.000
      // fijos se cubren vendiendo $1.000.000.
      expect(m.catalogBreakEven.target! * m.catalogBreakEven.marginPct!).toBeCloseTo(
        m.breakEvenBase,
        0,
      );
      // Y siempre por encima de los fijos: los productos cuestan.
      expect(m.catalogBreakEven.target!).toBeGreaterThan(m.breakEvenBase);
    });

    it('un producto sin costo conocido queda FUERA del promedio, nunca entra como gratis', async () => {
      const antes = await monthly();
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Test',
          name: 'Postre sin costear',
          basePrice: 9000,
          directResale: true,
          unitPurchase: 'unit',
          unitStock: 'unit',
          conversionFactor: 1,
          modifiersEnabled: false,
        })
        .expect(201);

      const despues = await monthly();
      expect(despues.catalogBreakEven.productsWithoutCost).toBe(
        antes.catalogBreakEven.productsWithoutCost + 1,
      );
      // El margen NO se movió: si hubiera entrado con costo 0 saltaría al 100 %.
      expect(despues.catalogBreakEven.marginPct).toBeCloseTo(
        antes.catalogBreakEven.marginPct!,
        4,
      );
    });
  });

  describe('el mes en curso se distingue de uno cerrado', () => {
    it('el mes actual viene marcado en curso, con el día que va', async () => {
      const r = await monthly();
      expect(r.periodStatus).toBe('in_progress');
      expect(r.periodDaysElapsed).toBeGreaterThan(0);
      expect(r.periodDaysElapsed!).toBeLessThanOrEqual(r.periodDaysTotal!);
    });

    it('un mes viejo viene cerrado; uno que no ha llegado, futuro', async () => {
      const viejo = await monthly(now.getFullYear() - 1, 1);
      expect(viejo.periodStatus).toBe('closed');
      expect(viejo.projectedNet ?? null).toBeNull();
      const futuro = await monthly(now.getFullYear() + 1, 1);
      expect(futuro.periodStatus).toBe('future');
      expect(futuro.projectedNet ?? null).toBeNull();
    });
  });

  describe('quien cobra todas las semanas pesa en el mes', () => {
    it('un empleado SIN fecha de ingreso entra a la nómina del estado', async () => {
      // La nómina semanal lo incluye desde siempre. Si el estado lo excluía,
      // esa persona cobraba y no aparecía: el dueño leía ganancia de más.
      const hash = await bcrypt.hash('dev12345', 10);
      const sinFecha = await prisma.user.create({
        data: {
          email: 'sin-fecha-fin@test.local',
          fullName: 'Sin Fecha',
          role: 'COCINERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
          payType: 'MONTHLY',
          salaryAmount: 1_500_000,
          hireDate: null,
        },
      });
      try {
        const r = await monthly();
        const nomina = r.fixedCosts.find((l) => l.isPayroll);
        expect(nomina).toBeDefined();
        expect(nomina!.monthlyAmount).toBeGreaterThanOrEqual(1_500_000);
      } finally {
        await prisma.user.delete({ where: { id: sinFecha.id } });
      }
    });
  });

  describe('un costo fijo con pagos no se puede borrar', () => {
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    it('borrarlo se rechaza y el mes viejo conserva su línea', async () => {
      const costo = (
        await request
          .post('/fixed-costs')
          .set(auth())
          .send({ name: `Aseo ${randomUUID().slice(0, 6)}`, category: 'Otros', frequency: 'MONTHLY', amount: 200_000, startedAt: hoyLocal() })
          .expect(201)
      ).body as { id: string };
      await request
        .post(`/fixed-costs/${costo.id}/payment`)
        .set(auth())
        .field('periodYear', String(now.getFullYear()))
        .field('periodMonth', String(now.getMonth() + 1))
        .field('amount', '200000')
        .field('cashAmount', '0')
        .field('bankAmount', '200000')
        .attach('proof', PNG, 'proof.png')
        .expect(201);

      const res = await request.delete(`/fixed-costs/${costo.id}`).set(auth()).expect(400);
      expect(String((res.body as { message: string }).message)).toMatch(/desactívalo/i);

      // Y desactivarlo NO le borra la línea al mes que ya lo pagó.
      await request.patch(`/fixed-costs/${costo.id}`).set(auth()).send({ isActive: false }).expect(200);
      const r = await monthly();
      expect(r.fixedCosts.some((l) => l.monthlyAmount === 200_000)).toBe(true);
    });
  });
  describe('un gasto puntual siempre tiene fecha', () => {
    // La fecha define en QUÉ MES pega. Sin ella, `startedAt` y `endedAt` quedan
    // en null y la regla "sin fecha = siempre vigente" lo cuenta en TODOS los
    // meses, para siempre: un gasto de una vez inflando la meta de ventas mes
    // tras mes. Crear ya lo exigía; quitarle la fecha después, no.
    it('no se puede dejar sin fecha ni al crear ni al editar, y el mes solo lo cuenta una vez', async () => {
      await request
        .post('/fixed-costs')
        .set(auth())
        .send({ name: `Sin fecha ${randomUUID().slice(0, 6)}`, category: 'Otros', frequency: 'ONE_TIME', amount: 500_000 })
        .expect(400);

      const nombre = `Puntual ${randomUUID().slice(0, 6)}`;
      const costo = (
        await request
          .post('/fixed-costs')
          .set(auth())
          .send({ name: nombre, category: 'Otros', frequency: 'ONE_TIME', amount: 500_000, startedAt: hoyLocal() })
          .expect(201)
      ).body as { id: string };

      const res = await request
        .patch(`/fixed-costs/${costo.id}`)
        .set(auth())
        .send({ startedAt: null })
        .expect(400);
      expect(String((res.body as { message: string }).message)).toMatch(/fecha/i);

      // Y sigue contándose una sola vez, en su mes.
      const r = await monthly();
      const lineas = r.fixedCosts.filter((l) => l.name === nombre);
      expect(lineas).toHaveLength(1);
      expect(lineas[0]!.isOneTime).toBe(true);
      expect(lineas[0]!.monthlyAmount).toBe(500_000);
    });
  });
  describe('lo que hay que cubrir incluye las pérdidas del mes', () => {
    // Decisión del dueño (2026-09-14). Las pérdidas van al NUMERADOR de la meta,
    // no dentro del margen: son plata ya gastada que hay que volver a vender.
    // Metidas en el margen, un conteo físico hacía saltar la meta más de un
    // millón ese día y BAJARLA al siguiente por pura dilución de las ventas.
    it('la merma del mes sube lo que hay que cubrir, y la meta con ella', async () => {
      const antes = await monthly();
      const cubrirAntes = antes.breakEvenBase + (antes.monthLossesCost ?? 0);

      const ing = (
        await request
          .post('/ingredients')
          .set(auth())
          .send({ name: `Merma meta ${randomUUID().slice(0, 6)}`, unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0, isActive: true })
          .expect(201)
      ).body as { id: string };
      // Compra 1 kg a $40.000 y tira 500 g → $20.000 de merma.
      await request
        .post('/invoices/manual')
        .set(auth())
        .send({
          supplierNit: `9${Date.now()}`,
          supplierName: 'Proveedor meta',
          total: 40_000,
          items: [{ entityType: 'INGREDIENT', ingredientId: ing.id, descriptionRaw: 'x', quantity: 1, unit: 'kg', unitPrice: 40_000, total: 40_000 }],
        })
        .expect(201);
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ entityType: 'INGREDIENT', ingredientId: ing.id, delta: -500, type: 'WASTE', notes: 'Se dañó' })
        .expect(201);

      const despues = await monthly();
      const cubrirDespues = despues.breakEvenBase + (despues.monthLossesCost ?? 0);

      // Los costos FIJOS no se movieron: lo que subió son las pérdidas.
      expect(despues.breakEvenBase).toBeCloseTo(antes.breakEvenBase, 2);
      expect(cubrirDespues - cubrirAntes).toBeCloseTo(20_000, 0);
      expect(despues.monthLossesCost).toBeCloseTo(
        despues.wasteCost + despues.shrinkageCost + despues.cortesiasCost + despues.refundCost + despues.freightCost,
        2,
      );
    });

    it('vender MÁS no baja lo que hay que cubrir', async () => {
      const antes = await monthly();
      const cubrirAntes = antes.breakEvenBase + (antes.monthLossesCost ?? 0);
      const sale = await request
        .post('/sales')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(201);
      await request
        .post(`/sales/${(sale.body as { id: string }).id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: 5000 })
        .expect(201);
      const despues = await monthly();
      expect(despues.revenue).toBeGreaterThan(antes.revenue);
      expect(despues.breakEvenBase + (despues.monthLossesCost ?? 0)).toBeCloseTo(cubrirAntes, 2);
    });
  });
});
