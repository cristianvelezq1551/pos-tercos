/**
 * simulacion-financiera.e2e-spec.ts — simulación aleatoria de la operación.
 *
 * Las otras suites prueban escenarios ESCRITOS A MANO: alguien pensó un caso,
 * lo montó y verificó el número. Eso encuentra lo que se sospecha. Esta suite
 * ataca lo que nadie pensó: genera miles de operaciones al azar —ventas con
 * descuentos, cuentas divididas, domicilios, anulaciones, reembolsos,
 * cortesías, mermas y sus anulaciones, producción, compras y movimientos de
 * caja— y después exige que TODOS los reportes cuadren contra una contabilidad
 * sombra escrita desde la especificación, no desde el código.
 *
 * Reproducibilidad: cada corrida se deriva de una semilla. Si falla, el
 * mensaje dice cuál; `SIM_SEED=<n> pnpm -F @pos-tercos/api test:e2e` repite
 * esa corrida exacta. `SIM_OPS` cambia cuántas operaciones por semilla.
 *
 * Las leyes que se verifican:
 *   L1  El ingreso es el mismo en el P&G, el resumen de ventas y la suma de ventas.
 *   L2  El envío no es ingreso, pero sí se reporta como plata recaudada.
 *   L3  Lo cobrado por cada medio de pago suma el ingreso.
 *   L4  El costo de lo vendido es el costo FIFO real, lote por lote.
 *   L5  Merma, cortesía y reembolso cuestan lo que costó el lote que salió.
 *   L6  Las unidades en stock son las que la operación dejó (ni una de más).
 *   L7  El inventario valorizado vale lo que costó lo que queda.
 *   L8  Conservación del valor: lo comprado = lo consumido + lo que queda.
 *   L9  El efectivo esperado en el cajón cuadra con lo cobrado y movido.
 *   L10 Ninguna venta queda con líneas que no sumen su total.
 */
import type { INestApplication } from '@nestjs/common';
import { cleanDb } from './helpers/db-cleaner';
import { evitarElSegundoSinPromos, hoyLocal } from './helpers/local-day';
import { descuentoDeLinea } from './simulation/promos';
import { Rng } from './simulation/rng';
import { Simulacion } from './simulation/simulador';
import { construirMundo, type Mundo } from './simulation/world';

/** Tolerancia en pesos para igualdades exactas (una venta, un pago). */
const CENTAVO = 0.02;

/**
 * Cota de la deriva de redondeo del FIFO, en pesos, para un volumen dado.
 *
 * El ledger redondea cada costo a 4 decimales (`roundCost`), así que sobre
 * cientos de miles de pesos movidos quedan fracciones de peso de diferencia
 * contra una cuenta de precisión infinita. La auditoría de 2026-07-25 midió esa
 * deriva y la acotó en **$0,48 por cada $1.000.000**; acá esa cota deja de ser
 * una nota en un documento y pasa a ser algo que el test EXIGE: si alguna vez
 * la supera, dejó de ser redondeo y es un error de cálculo.
 */
const derivaMaxima = (volumen: number, movimientos = 0): number =>
  0.05 + Math.abs(volumen) * 4.8e-7 + movimientos * DERIVA_POR_MOVIMIENTO;

/**
 * Deriva que aporta CADA movimiento de inventario, en pesos.
 *
 * Las cantidades se guardan con 4 decimales y una receta con merma da gramos
 * periódicos (100 / 0,9 = 111,111…), así que cada movimiento redondea un poco
 * contra una sombra de precisión infinita. Sobre cientos de movimientos esa
 * diferencia corre los bordes de los lotes y el costo FIFO se separa por
 * milésimas. Una milésima de peso por movimiento cubre eso con margen y sigue
 * siendo mucho menos que el error más pequeño que importa: un conteo entero mal
 * atribuido vale decenas de pesos, no centésimas.
 */
const DERIVA_POR_MOVIMIENTO = 1e-3;

/**
 * Semillas a correr. `SIM_SEED` acepta una (`SIM_SEED=404`, para reproducir un
 * fallo) o varias separadas por coma (`SIM_SEED=1,2,3`, que es como el nightly
 * pide profundidad). Sin la variable corren las cinco de siempre: suficiente
 * para CI y estable de una corrida a otra.
 */
const SEMILLAS = process.env.SIM_SEED
  ? process.env.SIM_SEED.split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
  : [101, 202, 303, 404, 505];
const OPS_POR_SEMILLA = Number(process.env.SIM_OPS ?? 120);

jest.setTimeout(15 * 60 * 1000);

describe('Simulación financiera aleatoria', () => {
  for (const semilla of SEMILLAS) {
    describe(`semilla ${semilla}`, () => {
      let mundo: Mundo;
      let sim: Simulacion;
      let app: INestApplication;
      /**
       * Día local en que ARRANCÓ esta semilla. El rango va desde ahí hasta el
       * día actual —no `hoy..hoy`— porque una corrida que empieza a las 23:59
       * termina en el día siguiente: con el rango pegado a `hoy`, las ventas
       * hechas antes de medianoche quedaban fuera del reporte y las leyes
       * fallaban por un fenómeno horario, no por un error de plata. La base
       * está limpia (`cleanDb`), así que abarcar dos días no mete nada ajeno.
       */
      let diaInicial = '';
      const rango = (): string => `from=${diaInicial}&to=${hoyLocal()}`;

      const get = async <T>(url: string): Promise<T> => {
        const res = await mundo.request.get(url).set(mundo.auth()).expect(200);
        return res.body as T;
      };

      /** El ledger cachea 60 s a propósito; acá medimos la lógica, no la caché. */
      const fresco = (): void => mundo.cogs.invalidateLedgerCache();

      /** Cuántos movimientos de inventario acumuló la corrida (ver `derivaMaxima`). */
      const movimientos = (): Promise<number> => mundo.prisma.inventoryMovement.count();

      beforeAll(async () => {
        diaInicial = hoyLocal();
        const rng = new Rng(semilla);
        mundo = await construirMundo(rng);
        app = mundo.app;
        sim = new Simulacion(mundo, rng);
        await correr(sim, rng, OPS_POR_SEMILLA);
      });

      afterAll(async () => {
        if (mundo) {
          await cleanDb(mundo.prisma);
          await app.close();
        }
      });

      it(`ejecuta la operación completa sin que ninguna falle (semilla ${semilla})`, () => {
        // Si una operación hubiera devuelto un código inesperado, `correr` ya
        // habría lanzado en beforeAll. Este caso deja el resumen a la vista.
        expect(sim.ventas.length).toBeGreaterThan(0);
        expect(Object.keys(sim.conteo).length).toBeGreaterThan(4);
      });

      it('L1 · el ingreso es el mismo en el P&G, el resumen de ventas y la suma de las ventas', async () => {
        fresco();
        const pnl = await get<{ revenue: number }>(`/reports/cogs/pnl?${rango()}`);
        const resumen = await get<{ totals: { revenue: number } }>(
          `/reports/sales-summary?${rango()}&granularity=daily`,
        );

        expect(pnl.revenue).toBeCloseTo(sim.ingreso, 2);
        expect(resumen.totals.revenue).toBeCloseTo(sim.ingreso, 2);
        expect(resumen.totals.revenue).toBeCloseTo(pnl.revenue, 2);
      });

      it('L2 · el envío no cuenta como ingreso pero sí se reporta como recaudado', async () => {
        fresco();
        const pnl = await get<{
          revenue: number;
          deliveryCollected: number;
          deliveryOrderCount: number;
        }>(`/reports/cogs/pnl?${rango()}`);

        expect(pnl.deliveryCollected).toBeCloseTo(sim.envioCobrado, 2);
        expect(pnl.deliveryOrderCount).toBe(sim.envioPedidos);

        // La suma bruta de las ventas vivas menos los envíos tiene que dar el
        // ingreso: si alguna pantalla contara el envío, esta resta no cerraría.
        const vivas = sim.ventas.filter((v) => v.estado === 'PAGADO');
        const bruto = vivas.reduce((acc, v) => acc + v.total, 0);
        const envios = vivas.reduce((acc, v) => acc + v.deliveryFee, 0);
        expect(bruto - envios).toBeCloseTo(pnl.revenue, 2);
      });

      it('L3 · lo cobrado por cada medio de pago suma exactamente el ingreso', async () => {
        const resumen = await get<{
          totals: { revenue: number };
          byMethod: Array<{ method: string; revenue: number }>;
        }>(`/reports/sales-summary?${rango()}&granularity=daily`);

        const sumaMetodos = resumen.byMethod.reduce((acc, m) => acc + m.revenue, 0);
        expect(sumaMetodos).toBeCloseTo(resumen.totals.revenue, 2);
      });

      it('L4 · el costo de lo vendido es el costo FIFO real, lote por lote', async () => {
        fresco();
        const pnl = await get<{
          cogs: number;
          cogsUnknownQty: number;
          cogsEstimatedQty: number;
        }>(`/reports/cogs/pnl?${rango()}`);
        // La simulación estricta repone antes de consumir: nunca hay stock
        // negativo, así que no debe quedar una sola unidad sin costo REAL. Si
        // apareciera un estimado, el COGS de abajo sería una aproximación y la
        // comparación exacta perdería sentido.
        expect(pnl.cogsUnknownQty).toBe(0);
        expect(pnl.cogsEstimatedQty).toBe(0);
        const movs = await movimientos();
        expect(Math.abs(pnl.cogs - sim.cogs)).toBeLessThanOrEqual(
          derivaMaxima(sim.cogs, movs),
        );
      });

      it('L5 · merma, cortesía y reembolso cuestan lo que costó el lote que salió', async () => {
        fresco();
        const pnl = await get<{
          wasteCost: number;
          cortesiaCost: number;
          refundCost: number;
        }>(`/reports/cogs/pnl?${rango()}`);

        const movs = await movimientos();
        expect(Math.abs(pnl.wasteCost - sim.costoMerma)).toBeLessThanOrEqual(
          derivaMaxima(sim.costoMerma, movs),
        );
        expect(Math.abs(pnl.cortesiaCost - sim.costoCortesia)).toBeLessThanOrEqual(
          derivaMaxima(sim.costoCortesia, movs),
        );
        expect(Math.abs(pnl.refundCost - sim.costoReembolso)).toBeLessThanOrEqual(
          derivaMaxima(sim.costoReembolso, movs),
        );
      });

      it('L6 · las unidades en stock son exactamente las que dejó la operación', async () => {
        const stock = await get<
          Array<{ type: string; id: string; currentStock: number; name: string }>
        >('/inventory/stock');

        // Cada `delta` se guarda con 4 decimales, así que cada movimiento puede
        // redondear hasta 5·10⁻⁵. La tolerancia se deriva de CUÁNTOS movimientos
        // tuvo el item, no de un épsilon inventado: así sigue detectando la
        // pérdida de una unidad entera por más larga que sea la corrida.
        const movimientos = await mundo.prisma.inventoryMovement.groupBy({
          by: ['entityType', 'ingredientId', 'productId', 'subproductId'],
          _count: { _all: true },
        });
        const conteoPorClave = new Map<string, number>();
        for (const g of movimientos) {
          const id = g.ingredientId ?? g.productId ?? g.subproductId;
          if (id) conteoPorClave.set(`${g.entityType}:${id}`, g._count._all);
        }

        const desviaciones: string[] = [];
        for (const item of stock) {
          const clave = `${item.type}:${item.id}`;
          const esperado = sim.stock(clave);
          const tolerancia = 1e-4 * (conteoPorClave.get(clave) ?? 1) + 1e-9;
          if (Math.abs(item.currentStock - esperado) > tolerancia) {
            desviaciones.push(
              `${item.name} (${clave}): API=${item.currentStock} sombra=${esperado} ` +
                `(diferencia ${(item.currentStock - esperado).toExponential(2)}, ` +
                `tolerancia ${tolerancia.toExponential(2)})`,
            );
          }
        }
        expect(desviaciones).toEqual([]);
      });

      it('L7 · el inventario valorizado vale lo que costó lo que queda', async () => {
        fresco();
        const val = await get<{
          totalValue: number;
          items: Array<{ entityType: string; id: string; qty: number; value: number }>;
        }>('/reports/cogs/inventory-valuation');

        expect(Math.abs(val.totalValue - sim.valorInventario)).toBeLessThanOrEqual(
          derivaMaxima(sim.valorInventario, await movimientos()),
        );
      });

      it('L8 · conservación del valor: lo comprado es lo consumido más lo que queda', async () => {
        fresco();
        const pnl = await get<{
          cogs: number;
          wasteCost: number;
          cortesiaCost: number;
          refundCost: number;
          shrinkageCost: number;
        }>(`/reports/cogs/pnl?${rango()}`);
        const val = await get<{ totalValue: number }>('/reports/cogs/inventory-valuation');

        // Ni un peso se crea ni se destruye: todo lo que entró al inventario o
        // se consumió o sigue guardado.
        //
        // El faltante de conteo entra por su propia línea del P&G desde
        // 2026-08-28 (L19). Antes había que sumarlo aparte porque el ledger no
        // lo atribuía a nada: la igualdad solo cerraba con un término que no
        // salía de ningún reporte.
        const consumido =
          pnl.cogs + pnl.wasteCost + pnl.cortesiaCost + pnl.refundCost + pnl.shrinkageCost;
        expect(Math.abs(consumido + val.totalValue - sim.compras)).toBeLessThanOrEqual(
          derivaMaxima(sim.compras, await movimientos()),
        );
      });

      it('L9 · el efectivo esperado en el cajón cuadra con lo cobrado y lo movido', async () => {
        const esperado = await get<{
          expectedCash: number;
          openingCash: number;
          cashIn: number;
          cashOut: number;
        }>(`/shifts/${mundo.shiftId}/expected-cash`);

        // Diagnóstico: si las entradas/salidas no cuadran, lo que hace falta
        // saber es QUÉ movimiento apareció de más, no cuánto sumaba.
        const movimientos = await mundo.prisma.cashMovement.findMany({
          where: { shiftId: mundo.shiftId },
          select: { type: true, method: true, amount: true, reason: true },
        });
        const detalle = movimientos
          .map((mv) => `${mv.type} ${mv.method} $${mv.amount} · ${mv.reason}`)
          .join(' | ');

        expect(esperado.openingCash).toBeCloseTo(mundo.openingCash, 2);
        expect({ cashIn: esperado.cashIn, cashOut: esperado.cashOut, detalle }).toEqual({
          cashIn: sim.cajaEntradas,
          cashOut: sim.cajaSalidas,
          detalle,
        });
        // Pesos enteros: el cajón se cuenta en billetes, no en centavos. Se
        // admite UN peso de diferencia y solo uno: prorratear el envío entre
        // las partes de una cuenta dividida produce totales que caen justo en
        // medio peso (…,50), y ahí dos sumas de coma flotante equivalentes
        // pueden redondear a lados distintos. Un error de verdad —una venta
        // mal contada, un movimiento perdido— vale cientos o miles, así que
        // esta cota lo sigue atrapando.
        expect(Math.abs(esperado.expectedCash - sim.efectivoEsperado)).toBeLessThanOrEqual(1);
      });

      it('L11 · el flete del proveedor se resta aparte y no encarece ningún lote', async () => {
        fresco();
        const pnl = await get<{
          freightCost: number;
          freightInvoiceCount: number;
          purchasedTotal: number;
          cogs: number;
        }>(`/reports/cogs/pnl?${rango()}`);

        expect(pnl.freightCost).toBeCloseTo(sim.fletes, 2);
        expect(pnl.freightInvoiceCount).toBe(sim.facturasConFlete);
        // La mercancía comprada es el total facturado MENOS el flete: si el
        // flete se hubiera colado en los lotes, este número lo incluiría y el
        // costo por producto quedaría inflado al azar.
        expect(pnl.purchasedTotal).toBeCloseTo(sim.comprasFacturadas, 2);
      });

      it('L12 · lo que se dejó de cobrar (promociones y descuentos) es exactamente lo regalado', async () => {
        fresco();
        const pnl = await get<{
          revenue: number;
          discountTotal: number;
          grossRevenue: number;
        }>(`/reports/cogs/pnl?${rango()}`);
        const resumen = await get<{ totals: { discount: number } }>(
          `/reports/sales-summary?${rango()}&granularity=daily`,
        );

        expect(pnl.discountTotal).toBeCloseTo(sim.descuentos, 2);
        expect(resumen.totals.discount).toBeCloseTo(sim.descuentos, 2);
        // El ingreso bruto es lo que habría entrado sin regalar nada.
        expect(pnl.grossRevenue).toBeCloseTo(pnl.revenue + pnl.discountTotal, 2);
        // Y la simulación tiene que haber ejercitado el motor de promociones:
        // si nunca aplicó una, esta ley estaría pasando por casualidad.
        expect(sim.descuentoPromos).toBeGreaterThan(0);
      });

      it('L10 · ninguna venta queda con líneas que no sumen su total', async () => {
        const ventas = await mundo.prisma.sale.findMany({
          where: { status: { not: 'CANCELADO_NO_PAGO' } },
          include: { items: true, payments: true },
        });

        const rotas: string[] = [];
        for (const v of ventas) {
          const sumaLineas = v.items.reduce((acc, i) => acc + Number(i.lineTotal), 0);
          const total = Number(v.total);
          const esperado = sumaLineas - Number(v.orderDiscountAmount ?? 0) + Number(v.deliveryFee ?? 0);
          if (Math.abs(total - esperado) > CENTAVO) {
            rotas.push(
              `#${v.receiptNumber}: total=${total} líneas=${sumaLineas} ` +
                `descOrden=${v.orderDiscountAmount} envío=${v.deliveryFee}`,
            );
          }
          // Los pagos de una venta cobrada tienen que cubrir su total exacto.
          if (v.paidAt && v.payments.length > 0) {
            const pagado = v.payments.reduce((acc, p) => acc + Number(p.amount), 0);
            if (Math.abs(pagado - total) > CENTAVO) {
              rotas.push(`#${v.receiptNumber}: pagos=${pagado} total=${total}`);
            }
          }
        }
        expect(rotas).toEqual([]);
      });

      it('L15 · una cuenta abierta no aporta un peso ni consume stock hasta cobrarse', async () => {
        // El pedido existe y la cocina ya lo hizo, pero la plata no entró. Debe
        // ser invisible para ingresos, costo y caja: si asomara en cualquiera
        // de los tres, el dueño estaría viendo plata que todavía no tiene.
        const abiertas = await mundo.prisma.sale.findMany({
          where: { isOpenTab: true, status: 'PENDIENTE_PAGO' },
          select: { id: true, total: true },
        });
        expect(abiertas.length).toBe(sim.cuentasAbiertas.length);

        for (const cuenta of abiertas) {
          const movimientos = await mundo.prisma.inventoryMovement.count({
            where: { sourceType: 'sale', sourceId: cuenta.id },
          });
          expect(movimientos).toBe(0);
          const pagos = await mundo.prisma.salePayment.count({ where: { saleId: cuenta.id } });
          expect(pagos).toBe(0);
        }

        // Las leyes L1 y L9 ya midieron ingreso y efectivo contra la sombra,
        // que nunca contó estas cuentas: verlas acá cierra el argumento.
        expect(sim.cuentasAbiertas.every((c) => c.total > 0)).toBe(true);
      });

      it('L19 · el faltante detectado al contar es una pérdida y aparece en su propia línea', async () => {
        // Hasta 2026-08-28 este valor se iba del inventario sin entrar a NINGUNA
        // línea del P&G: el margen bruto quedaba alto por exactamente esa plata.
        // Ahora tiene línea propia, separada de la merma — la merma alguien la
        // declaró, el faltante apareció solo al contar, y verlos juntos es el
        // dato que dice si hay un problema de manejo.
        if ((sim.conteo['conteo-fisico'] ?? 0) === 0) await sim.conteoFisico();
        expect(sim.faltantesPorConteo).toBeGreaterThan(0);

        fresco();
        const pnl = await get<{
          shrinkageCost: number;
          wasteCost: number;
          cortesiaCost: number;
        }>(`/reports/cogs/pnl?${rango()}`);

        // Cuesta el costo REAL del lote que salió, igual que la merma.
        const movs = await movimientos();
        expect(Math.abs(pnl.shrinkageCost - sim.faltantesPorConteo)).toBeLessThanOrEqual(
          derivaMaxima(sim.faltantesPorConteo, movs),
        );
        // Y no se coló en las otras líneas: cada pérdida cuenta una sola vez.
        expect(Math.abs(pnl.wasteCost - sim.costoMerma)).toBeLessThanOrEqual(
          derivaMaxima(sim.costoMerma, movs),
        );
        expect(Math.abs(pnl.cortesiaCost - sim.costoCortesia)).toBeLessThanOrEqual(
          derivaMaxima(sim.costoCortesia, movs),
        );

        // El reporte de uso —donde el dueño mira QUÉ insumo se le está yendo—
        // tiene que decir el MISMO número que el P&G, no una estimación propia.
        // Dos cifras para la misma pérdida según la pantalla es exactamente lo
        // que esta suite existe para impedir.
        const uso = await get<{
          rows: Array<{ shortageCost: number | null; shortageQty: number }>;
          totals: { shortageCost: number };
        }>(`/reports/inventory-usage?${rango()}`);
        const sumaFaltantes = uso.rows.reduce((a, r) => a + (r.shortageCost ?? 0), 0);
        expect(Math.abs(sumaFaltantes - pnl.shrinkageCost)).toBeLessThanOrEqual(
          derivaMaxima(pnl.shrinkageCost, movs) + uso.rows.length,
        );

        // Queda rastro auditable de cada conteo, con su diferencia.
        const conteos = await get<
          Array<{ status: string; difference: number; countedQty: number; ledgerQty: number }>
        >('/inventory/counts?limit=100');
        const faltantes = conteos.filter((c) => c.status === 'APPROVED' && c.difference < 0);
        expect(faltantes.length).toBeGreaterThan(0);
        for (const c of faltantes) {
          expect(c.countedQty - c.ledgerQty).toBeCloseTo(c.difference, 4);
        }
      });

      it('L20 · un ajuste manual suelto NO es pérdida: corrige un dato, no declara nada', async () => {
        // La otra mitad de la regla. Un admin que corrige "cargué 10 kg y eran
        // 1" no está declarando una pérdida: está arreglando una entrada mal
        // cargada. Contarlo como pérdida cobraría dos veces el mismo insumo.
        fresco();
        const antes = await get<{ shrinkageCost: number; wasteCost: number }>(
          `/reports/cogs/pnl?${rango()}`,
        );

        const insumo = mundo.insumos[0]!;
        await mundo.request
          .post('/inventory/movements')
          .set(mundo.auth())
          .send({
            entityType: 'INGREDIENT',
            ingredientId: insumo.id,
            delta: 5,
            type: 'MANUAL_ADJUSTMENT',
            unitCost: 20,
          })
          .expect(201);
        await mundo.request
          .post('/inventory/movements')
          .set(mundo.auth())
          .send({
            entityType: 'INGREDIENT',
            ingredientId: insumo.id,
            delta: -5,
            type: 'MANUAL_ADJUSTMENT',
            notes: 'Corrección: había cargado de más',
          })
          .expect(201);

        fresco();
        const despues = await get<{ shrinkageCost: number; wasteCost: number }>(
          `/reports/cogs/pnl?${rango()}`,
        );
        expect(despues.shrinkageCost).toBeCloseTo(antes.shrinkageCost, 2);
        expect(despues.wasteCost).toBeCloseTo(antes.wasteCost, 2);
      });

      it('L18 · los cuatro tipos de promoción se aplicaron y descontaron lo suyo', async () => {
        const aplicadas = await mundo.prisma.saleItem.groupBy({
          by: ['appliedPromotionId'],
          where: { appliedPromotionId: { not: null } },
          _count: { _all: true },
        });
        const usadas = new Set(aplicadas.map((a) => a.appliedPromotionId));

        // Cada TIPO tiene que haberse disparado: un 2x1 solo aplica con 3
        // unidades y un descuento de combo solo sobre una línea de combo, así
        // que si la simulación no llegó a esos casos, esta ley estaría pasando
        // sin haber probado nada.
        //
        // La exigencia va sobre las promociones SIN competencia: cada una tiene
        // su producto y no hay excusa para que no se aplique. Las que comparten
        // producto quedan fuera — una puede perder siempre contra la otra, y eso
        // es la regla del ganador funcionando, no un fallo.
        const sinDisputa = mundo.promos.filter((p) => !p.disputada);
        expect(sinDisputa.filter((p) => !usadas.has(p.id)).map((p) => p.tipo)).toEqual([]);

        // Y donde compiten, ganó la de MAYOR descuento absoluto en pesos: es la
        // única forma justa de comparar un 20% contra $3.000.
        const enCompetencia = mundo.promos.filter((p) => p.disputada);
        if (enCompetencia.length > 1) {
          const productoDisputado = enCompetencia[0]!.productoId;
          // Las ventas EDITADAS quedan fuera: ahí el descuento no se re-cotiza,
          // se congela el del cobro y se escala por unidad (§7.v41). Compararlas
          // contra "el mejor descuento de hoy" mediría la regla equivocada.
          const lineas = await mundo.prisma.saleItem.findMany({
            where: {
              productId: productoDisputado,
              appliedPromotionId: { not: null },
              saleId: { notIn: [...sim.editadas] },
            },
            select: {
              quantity: true,
              lineSubtotal: true,
              lineDiscount: true,
              appliedPromotionId: true,
            },
            take: 100,
          });
          const perdedoras: string[] = [];
          for (const l of lineas) {
            const mejor = descuentoDeLinea(enCompetencia, {
              productoId: productoDisputado,
              subtotal: Number(l.lineSubtotal),
              cantidad: l.quantity,
              esCombo: false,
            });
            if (Math.abs(Number(l.lineDiscount) - mejor) > CENTAVO) {
              perdedoras.push(
                `x${l.quantity} sub=${l.lineSubtotal}: aplicó ${l.lineDiscount}, ` +
                  `el mejor descuento posible era ${mejor}`,
              );
            }
          }
          expect(perdedoras).toEqual([]);
        }

        // Ninguna línea puede tener descuento de promoción Y descuento manual:
        // son excluyentes por decisión cerrada (§7.v12).
        const mezcladas = await mundo.prisma.saleItem.count({
          where: {
            appliedPromotionId: { not: null },
            manualDiscountKind: { not: null },
          },
        });
        expect(mezcladas).toBe(0);

        // Y el descuento nunca puede superar el subtotal de su línea (dejaría
        // el total en negativo).
        const lineas = await mundo.prisma.saleItem.findMany({
          select: { lineSubtotal: true, lineDiscount: true, lineTotal: true },
        });
        const rotas = lineas.filter(
          (l) =>
            Number(l.lineDiscount) > Number(l.lineSubtotal) ||
            Number(l.lineTotal) < 0 ||
            Math.abs(
              Number(l.lineSubtotal) - Number(l.lineDiscount) - Number(l.lineTotal),
            ) > CENTAVO,
        );
        expect(rotas).toEqual([]);
      });

      it('L17 · el tamaño y los extras cobran de más y descuentan de más', async () => {
        // Que la ley pase sin haberse ejercitado es peor que no tenerla: si el
        // producto con opciones nunca se vendió, L4 y L6 estarían midiendo un
        // camino que no se recorrió.
        expect(sim.conteo['linea-con-tamano'] ?? 0).toBeGreaterThan(0);
        expect(sim.conteo['linea-con-extras'] ?? 0).toBeGreaterThan(0);
        expect(sim.conteo['linea-que-consume-extra'] ?? 0).toBeGreaterThan(0);

        // El precio de la línea NO es el precio base: el tamaño y los extras lo
        // mueven, y el total ya se verificó contra el cálculo a mano en cada
        // venta. Acá se comprueba que la base guardó esas opciones.
        const conTamano = await mundo.prisma.saleItem.count({
          where: { sizeId: { not: null } },
        });
        expect(conTamano).toBeGreaterThan(0);

        const items = await mundo.prisma.saleItem.findMany({
          where: { sizeId: { not: null } },
          select: { unitPrice: true, productId: true },
          take: 50,
        });
        const base = mundo.conOpciones.producto.precio;
        // Al menos una línea con tamaño grande tiene que costar más que la base.
        expect(items.some((i) => Number(i.unitPrice) > base)).toBe(true);
      });

      it('L16 · el pedido web recorre su ciclo: recoger termina en listo, domicilio cierra en entregado', async () => {
        const web = await mundo.prisma.sale.findMany({
          where: { type: { in: ['WEB_PICKUP', 'WEB_DELIVERY'] } },
          select: {
            id: true,
            type: true,
            status: true,
            deliveryAddress: true,
            paidAt: true,
          },
        });
        expect(web.length).toBeGreaterThan(0);

        const mal: string[] = [];
        for (const p of web) {
          // Un domicilio SIN dirección viola el CHECK de la base y dejaría un
          // hueco de recibo; uno para recoger no puede tener dirección.
          if (p.type === 'WEB_DELIVERY' && !p.deliveryAddress) {
            mal.push(`${p.id}: domicilio sin dirección`);
          }
          if (p.type === 'WEB_PICKUP' && p.deliveryAddress) {
            mal.push(`${p.id}: pedido para recoger con dirección de entrega`);
          }
          // "Listo" es el final para RECOGER. Para DOMICILIO significa que salió
          // en la moto: si se quedara ahí, "va en camino" y "el cliente ya
          // comió" serían indistinguibles y el tiempo de reparto no se podría
          // medir. Por eso ENTREGADO solo puede existir en domicilio.
          if (p.status === 'ENTREGADO' && p.type !== 'WEB_DELIVERY') {
            mal.push(`${p.id}: un pedido para recoger no se "entrega"`);
          }
        }
        expect(mal).toEqual([]);

        // Los pedidos que el CLIENTE hizo en la web sí recorrieron el ciclo
        // completo. (Un domicilio cargado por el cajero puede quedarse en
        // PAGADO: avanzarlo es una acción manual y, si no la hace, el pedido no
        // se mueve — §7.v25. Eso es operación, no un error de cálculo.)
        const porId = new Map(web.map((w) => [w.id, w]));
        const sinCerrar: string[] = [];
        for (const pedido of sim.pedidosWeb) {
          const p = porId.get(pedido.id);
          if (!p || p.status === 'VOID') continue; // reembolsado después
          const esperado = sim.entregados.includes(pedido.id)
            ? 'ENTREGADO'
            : 'LISTO_DESPACHO';
          if (p.status !== esperado) {
            sinCerrar.push(`${p.id}: quedó en ${p.status}, se esperaba ${esperado}`);
          }
        }
        expect(sinCerrar).toEqual([]);
      });

      it('L13 · repetir una operación con la misma clave no la duplica', async () => {
        // Idempotencia sobre PRODUCIR, que es la operación que más daño hace si
        // se repite: descuenta insumos Y crea stock. Un reintento del cliente
        // (red inestable, doble toque) debe devolver la tanda anterior, no
        // cocinar dos veces.
        const sub = mundo.subproductos[0]!;
        const clave = `sim-idem-${semilla}`;
        // Al llegar acá el inventario quedó donde lo dejó la operación del día:
        // sin reponer, producir falla por falta de insumo (409) y el test
        // mediría eso en vez de la idempotencia.
        await sim.asegurarInsumosParaProducir(sub.id, sub.yield);

        const antes = await get<Array<{ type: string; id: string; currentStock: number }>>(
          '/inventory/stock',
        );
        const stockAntes = antes.find((i) => i.id === sub.id)?.currentStock ?? 0;

        const cuerpo = { quantityProduced: sub.yield, idempotencyKey: clave };
        const uno = await mundo.request
          .post(`/subproducts/${sub.id}/produce`)
          .set(mundo.auth())
          .send(cuerpo)
          .expect(201);
        const dos = await mundo.request
          .post(`/subproducts/${sub.id}/produce`)
          .set(mundo.auth())
          .send(cuerpo)
          .expect(201);

        expect(dos.body.runId).toBe(uno.body.runId);

        const despues = await get<Array<{ type: string; id: string; currentStock: number }>>(
          '/inventory/stock',
        );
        const stockDespues = despues.find((i) => i.id === sub.id)?.currentStock ?? 0;
        // Una sola tanda, no dos.
        expect(stockDespues - stockAntes).toBeCloseTo(sub.yield, 4);
      });

      it('L14 · al cerrar la caja el arqueo cuadra y el turno no inventa plata', async () => {
        // Se cuenta EXACTAMENTE lo que el sistema espera, en efectivo y en cada
        // medio digital: el descuadre tiene que dar 0. Si diera otra cosa, el
        // cajero estaría cuadrando contra un número que el sistema no sabe
        // reproducir.
        const esperado = await get<{
          expectedCash: number;
          digital: Array<{ method: string; expected: number }>;
        }>(`/shifts/${mundo.shiftId}/expected-cash`);

        const cerrado = await mundo.request
          .post(`/shifts/${mundo.shiftId}/close`)
          .set(mundo.auth())
          .send({
            countedCash: esperado.expectedCash,
            digitalCounts: esperado.digital.map((d) => ({
              method: d.method,
              counted: d.expected,
            })),
          })
          .expect(201);

        expect(Number(cerrado.body.difference)).toBe(0);
        expect(Number(cerrado.body.expectedCash)).toBe(esperado.expectedCash);
        for (const linea of cerrado.body.digitalCountBreakdown ?? []) {
          expect(Number(linea.difference)).toBe(0);
        }

        // Y el detalle de la sesión tiene que cerrar sobre sí mismo: lo cobrado
        // por método es exactamente lo vendido, sin el envío por ningún lado.
        const detalle = await get<{
          summary: {
            totalRevenue: number;
            deliveryCollected: number;
            byMethod: Array<{ method: string; total: number }>;
            byType: Array<{ type: string; total: number }>;
          };
        }>(`/shifts/${mundo.shiftId}/detail`);

        const porMetodo = detalle.summary.byMethod.reduce((acc, m) => acc + m.total, 0);
        const porTipo = detalle.summary.byType.reduce((acc, t) => acc + t.total, 0);
        expect(porMetodo).toBeCloseTo(detalle.summary.totalRevenue, 2);
        expect(porTipo).toBeCloseTo(detalle.summary.totalRevenue, 2);
        expect(detalle.summary.deliveryCollected).toBeCloseTo(sim.envioCobrado, 2);
      });
    });
  }
});

/**
 * Ejecuta `n` operaciones eligiendo cada una por peso. Los pesos imitan un día
 * real: se vende mucho más de lo que se anula, y las pérdidas son excepcionales.
 */
async function correr(sim: Simulacion, rng: Rng, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    // El único momento del día en que las promos «siempre vigentes» de este
    // mundo no aplican (ver el helper). Sin esto la corrida que cruza
    // medianoche falla por el reloj, no por un error de plata.
    await evitarElSegundoSinPromos();
    const op = rng.weighted({
      venta: 40,
      ventaDomicilio: 8,
      webRecoger: 8,
      webDomicilio: 8,
      cortesia: 6,
      merma: 6,
      anularMerma: 4,
      anulacion: 6,
      reembolso: 4,
      produccion: 6,
      compra: 6,
      factura: 8,
      conteo: 5,
      edicion: 8,
      abrirCuenta: 6,
      cobrarCuenta: 5,
      revertirCortesia: 3,
      caja: 6,
    });

    switch (op) {
      case 'venta':
        await sim.vender();
        break;
      case 'ventaDomicilio':
        await sim.vender({ domicilio: true });
        break;
      case 'cortesia':
        await sim.cortesia();
        break;
      case 'merma':
        await sim.merma();
        break;
      case 'anularMerma': {
        const pendiente = sim.mermas.filter((m) => m.devuelto === 0);
        if (pendiente.length > 0) await sim.anularMerma(rng.pick(pendiente));
        break;
      }
      case 'anulacion': {
        // Anular devuelve el stock, así que solo vale mientras la cocina no
        // haya despachado. Un pedido ya despachado se corrige REEMBOLSANDO
        // (la comida se consumió y su costo es pérdida, no vuelve al inventario).
        const vivas = sim.ventas.filter((v) => v.estado === 'PAGADO' && !v.despachado);
        if (vivas.length > 0) await sim.anular(rng.pick(vivas));
        break;
      }
      case 'reembolso': {
        // Reembolsar aplica a un pedido que ya salió: los web llegan ahí solos,
        // y a un domicilio de mostrador hay que despacharlo primero.
        const vivas = sim.ventas.filter(
          (v) => v.estado === 'PAGADO' && (v.despachado || v.deliveryFee > 0),
        );
        if (vivas.length > 0) await sim.reembolsar(rng.pick(vivas));
        break;
      }
      case 'produccion': {
        const sub = rng.pick(sim.m.subproductos);
        // Múltiplo del rendimiento: producir media tanda es válido, pero acá
        // interesa el camino normal de cocina.
        await sim.producir(sub.id, sub.yield * rng.int(1, 3));
        break;
      }
      case 'webRecoger':
        await sim.pedidoWeb({ domicilio: false });
        break;
      case 'webDomicilio':
        await sim.pedidoWeb({ domicilio: true });
        break;
      case 'abrirCuenta':
        await sim.abrirCuenta();
        break;
      case 'cobrarCuenta': {
        if (sim.cuentasAbiertas.length > 0) {
          await sim.cobrarCuenta(rng.pick(sim.cuentasAbiertas));
        }
        break;
      }
      case 'edicion': {
        const editables = sim.ventas.filter((v) => v.estado === 'PAGADO' && v.editable);
        if (editables.length > 0) await sim.editar(rng.pick(editables));
        break;
      }
      case 'conteo':
        await sim.conteoFisico();
        break;
      case 'factura':
        await sim.comprarConFactura();
        break;
      case 'revertirCortesia': {
        const pendientes = sim.cortesias.filter((c) => !c.revertida);
        if (pendientes.length > 0) await sim.revertirCortesia(rng.pick(pendientes));
        break;
      }
      case 'compra': {
        // Reposición valorizada: crea un lote nuevo a un precio DISTINTO del
        // anterior, que es lo que obliga al FIFO a cruzar lotes al vender.
        const aInsumo = rng.chance(0.7);
        if (aInsumo) {
          const ins = rng.pick(sim.m.insumos);
          await sim.entrada('INGREDIENT', ins.id, rng.int(200, 2000), rng.int(5, 60));
        } else {
          const rev = rng.pick(sim.m.productos.filter((p) => p.directResale));
          await sim.entrada('PRODUCT', rev.id, rng.int(10, 200), rng.int(500, 4000));
        }
        break;
      }
      case 'caja':
        await sim.movimientoCaja();
        break;
    }
  }
}
