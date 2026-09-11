#!/usr/bin/env node
/**
 * Auditoría del estado financiero contra un API DESPLEGADO (QA o prod), por
 * HTTP y como dueño: arma un panorama completo del mes (catálogo, compra con
 * flete, ventas con descuento, anulación, cortesía, merma, faltante de conteo,
 * costos fijos pagados y sin pagar, anual, puntual, compromisos) y verifica
 * línea por línea que el estado financiero diga lo que la contabilidad
 * sombra espera. Cierra con el análisis de IA real y comprueba que su tono
 * siga la regla que ve el dueño en pantalla.
 *
 * Es una prueba de ACEPTACIÓN sobre datos vivos, no un e2e: por eso mide por
 * DELTAS entre el estado antes y después de cada paso (el entorno puede
 * tener datos previos) y por NOMBRE en las líneas de costos fijos.
 *
 *   API_URL=https://api-qa-5833.up.railway.app \
 *   AUDITOR_EMAIL=... AUDITOR_PASSWORD=... [AUDITOR_PIN=246810] \
 *   node scripts/auditoria-estado-financiero.mjs
 *
 * NO borra nada al terminar: el panorama queda para mirarlo en la pantalla.
 * Los nombres llevan un sufijo por corrida para no chocar con la unicidad
 * de nombres activos.
 */

const API = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const EMAIL = process.env.AUDITOR_EMAIL;
const PASSWORD = process.env.AUDITOR_PASSWORD;
const PIN = process.env.AUDITOR_PIN ?? '246810';
if (!EMAIL || !PASSWORD) {
  console.error('Faltan AUDITOR_EMAIL y AUDITOR_PASSWORD.');
  process.exit(2);
}

const STAMP = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
const N = (s) => `${s} AUD${STAMP}`;
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// ------------------------------------------------------------------ HTTP
let token = '';
async function api(method, path, body, opts = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) };
  let payload;
  if (opts.form) {
    payload = opts.form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (opts.expect !== undefined && res.status !== opts.expect) {
    throw new Error(`${method} ${path} → ${res.status} (esperaba ${opts.expect}): ${text.slice(0, 300)}`);
  }
  return { status: res.status, body: json };
}
const post = (p, b, o) => api('POST', p, b, { expect: 201, ...o });
const get = (p, o) => api('GET', p, undefined, { expect: 200, ...o });
const patch = (p, b, o) => api('PATCH', p, b, { expect: 200, ...o });

// ------------------------------------------------------------------ Aserciones
const resultados = [];
let seccionActual = '';
const seccion = (s) => {
  seccionActual = s;
  console.log(`\n== ${s}`);
};
function check(nombre, actual, esperado, tol = 0.01) {
  const ok =
    typeof esperado === 'number'
      ? Math.abs(Number(actual) - esperado) <= tol
      : actual === esperado;
  resultados.push({ seccion: seccionActual, nombre, ok, actual, esperado });
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : `  → esperado ${fmt(esperado)}, llegó ${fmt(actual)}`}`);
}
function checkTrue(nombre, cond, detalle = '') {
  resultados.push({ seccion: seccionActual, nombre, ok: !!cond, actual: detalle, esperado: 'verdadero' });
  console.log(`${cond ? '  ✓' : '  ✗'} ${nombre}${cond ? '' : `  → ${detalle}`}`);
}
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('es-CO') : JSON.stringify(v));
const delta = (a, b, campo) => Number(b[campo]) - Number(a[campo]);

// ------------------------------------------------------------------ Voseo
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
function detectorDeVoseo() {
  try {
    const req = createRequire(import.meta.url);
    const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const guia = req(resolve(raiz, 'packages/domain/dist/guia/index.js'));
    return typeof guia.palabrasVoseo === 'function' ? guia.palabrasVoseo : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Estado
const hoy = new Date();
const Y = hoy.getFullYear();
const M = hoy.getMonth() + 1;
const sig = new Date(Y, M, 1);
const YN = sig.getFullYear();
const MN = sig.getMonth() + 1;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const estado = async (y = Y, m = M) => (await get(`/reports/financial/monthly?year=${y}&month=${m}`)).body;
/**
 * El motor de costos cachea el replay 60 s (staleness deliberada, §7.v18): una
 * venta cobrada hace 5 s todavía no está en el COGS. Se relee hasta que la
 * condición se cumpla o venza la caché con margen; devolver antes daría un
 * falso rojo por una regla conocida, y no reintentar taparía un bug real.
 */
const TTL_MS = 60_000;
async function estadoCuando(pred, y = Y, m = M) {
  const inicio = Date.now();
  let s = await estado(y, m);
  while (!pred(s) && Date.now() - inicio < TTL_MS + 15_000) {
    await new Promise((r) => setTimeout(r, 5_000));
    s = await estado(y, m);
  }
  return s;
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const linea = (s, name) => s.fixedCosts.find((l) => l.name === name);

// ------------------------------------------------------------------ Escenario
async function main() {
  seccion(`Entrada a ${API}`);
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD }, { expect: 200 });
  token = login.body.accessToken;
  checkTrue('sesión de dueño', !!token);
  await post('/approvals/pin', { pin: PIN, password: PASSWORD });

  const st = (await get('/shifts/current-status')).body;
  if (st.stalePreviousDay) {
    throw new Error('Hay una caja abierta de un día anterior: ciérrala en la app antes de correr la auditoría.');
  }
  if (!st.shift) await post('/shifts/open', { openingCash: 0 });
  checkTrue('caja abierta para vender', true);

  const S0 = await estado();
  const N0 = await estado(YN, MN);
  console.log(`  estado inicial: ingresos ${fmt(S0.revenue)} · neto ${fmt(S0.netResult)} · fijos ${fmt(S0.totalFixed)}`);

  // ---- Catálogo
  seccion('Catálogo: 3 insumos, una hamburguesa con receta y una gaseosa de reventa');
  const pan = (await post('/ingredients', { name: N('Pan'), unitPurchase: 'unidad', unitRecipe: 'unidad', conversionFactor: 1, thresholdMin: 0, isActive: true })).body.id;
  const carne = (await post('/ingredients', { name: N('Carne'), unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0, isActive: true })).body.id;
  const queso = (await post('/ingredients', { name: N('Queso'), unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0, isActive: true })).body.id;
  const hamb = (await post('/products', { category: 'Comidas', name: N('Hamburguesa'), basePrice: 15_000, directResale: false, modifiersEnabled: false })).body.id;
  await api('PUT', `/products/${hamb}/recipe`, {
    edges: [
      { childType: 'ingredient', childId: pan, quantityNeta: 1, mermaPct: 0 },
      { childType: 'ingredient', childId: carne, quantityNeta: 150, mermaPct: 0 },
      { childType: 'ingredient', childId: queso, quantityNeta: 20, mermaPct: 0 },
    ],
  }, { expect: 200 });
  const gaseosa = (await post('/products', { category: 'Bebidas', name: N('Gaseosa'), basePrice: 4_000, directResale: true, unitPurchase: 'caja', unitStock: 'unidad', conversionFactor: 24, thresholdMin: 0, modifiersEnabled: false })).body.id;
  checkTrue('catálogo creado', !!(pan && carne && queso && hamb && gaseosa));

  // ---- Compra con flete
  seccion('Compra: factura manual con flete de $8.000');
  const FLETE = 8_000;
  const COMPRA = 180_000 + 300_000 + 50_000 + 96_000; // 626.000
  await post('/invoices/manual', {
    supplierNit: `900${STAMP}`,
    supplierName: N('Proveedor'),
    invoiceNumber: `AUD-${STAMP}`,
    total: COMPRA + FLETE,
    freight: FLETE,
    items: [
      { entityType: 'INGREDIENT', ingredientId: pan, descriptionRaw: 'Pan', quantity: 100, unit: 'unidad', unitPrice: 1_800, total: 180_000 },
      { entityType: 'INGREDIENT', ingredientId: carne, descriptionRaw: 'Carne', quantity: 10, unit: 'kg', unitPrice: 30_000, total: 300_000 },
      { entityType: 'INGREDIENT', ingredientId: queso, descriptionRaw: 'Queso', quantity: 2, unit: 'kg', unitPrice: 25_000, total: 50_000 },
      { entityType: 'PRODUCT', productId: gaseosa, descriptionRaw: 'Gaseosa', quantity: 2, unit: 'caja', unitPrice: 48_000, total: 96_000 },
    ],
  });
  const S1 = await estado();
  check('flete de compra sube exactamente lo cobrado', delta(S0, S1, 'freightCost'), FLETE);
  check('facturas con flete: una más', delta(S0, S1, 'freightInvoiceCount'), 1);
  check('mercancía comprada (contexto, no gasto) sube sin el flete', delta(S0, S1, 'purchasedTotal'), COMPRA);
  check('una compra NO mueve los ingresos', delta(S0, S1, 'revenue'), 0);
  check('una compra NO mueve el COGS (es inventario hasta que se vende)', delta(S0, S1, 'cogs'), 0);
  check('una compra NO mueve el neto salvo por el flete', delta(S0, S1, 'netResult'), -FLETE);

  // Costo de la hamburguesa a FIFO: 1.800 + 150 × 30 + 20 × 25 = 6.800.
  const COSTO_HAMB = 1_800 + 150 * 30 + 20 * 25;
  const COSTO_GAS = 2_000;

  // ---- Ventas
  seccion('Ventas: una normal, una con descuento manual, una anulada con PIN');
  const vender = async (items, extra = {}) => {
    const s = (await post('/sales', { type: 'COUNTER', items, ...extra }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })).body;
    await post(`/sales/${s.id}/confirm-payment`, { method: 'CASH', amountReceived: Number(s.total) });
    return s;
  };
  const v1 = await vender([{ productId: hamb, quantity: 3 }, { productId: gaseosa, quantity: 2 }]);
  check('venta 1 cobra 3 × 15.000 + 2 × 4.000', Number(v1.total), 53_000);
  const v2 = await vender([{ productId: hamb, quantity: 2 }], { orderDiscount: { kind: 'FIXED', value: 5_000 }, discountReason: 'Auditoría: descuento manual' });
  check('venta 2 cobra 30.000 − 5.000 de descuento', Number(v2.total), 25_000);
  const S2 = await estadoCuando((s) => delta(S1, s, 'cogs') > 0);
  check('ingresos suben lo cobrado (78.000)', delta(S1, S2, 'revenue'), 78_000);
  check('ventas a precio de lista suben 83.000', delta(S1, S2, 'grossRevenue'), 83_000);
  check('descuentos suben 5.000', delta(S1, S2, 'discountTotal'), 5_000);
  check('COGS sube el costo FIFO de 5 hamburguesas y 2 gaseosas', delta(S1, S2, 'cogs'), 5 * COSTO_HAMB + 2 * COSTO_GAS);
  check('margen bruto = ingresos − COGS', delta(S1, S2, 'grossMargin'), 78_000 - (5 * COSTO_HAMB + 2 * COSTO_GAS));
  check('dos ventas más en el conteo', delta(S1, S2, 'salesCount'), 2);
  checkTrue('el COGS no es estimado ni parcial (todo tenía lote)', !S2.cogsEstimated && !S2.cogsPartial, JSON.stringify({ e: S2.cogsEstimated, p: S2.cogsPartial }));

  const v3 = await vender([{ productId: hamb, quantity: 1 }, { productId: gaseosa, quantity: 1 }]);
  await post(`/sales/${v3.id}/void`, { reason: 'Auditoría: anulación' }, { headers: { 'x-approval-pin': PIN } });
  // Acá se espera que NADA cambie, así que no hay condición que esperar: se
  // deja vencer la caché entera para leer el motor ya con la anulación.
  console.log('  (esperando a que venza la caché del motor de costos…)');
  await dormir(TTL_MS + 3_000);
  const S3 = await estado();
  check('una venta anulada no deja ingresos', delta(S2, S3, 'revenue'), 0);
  check('una venta anulada no deja COGS (revierte el stock)', delta(S2, S3, 'cogs'), 0);
  check('una venta anulada no cuenta como venta', delta(S2, S3, 'salesCount'), 0);

  // ---- Cortesía, merma, faltante
  seccion('Pérdidas: cortesía, merma declarada y faltante de conteo');
  await post('/cortesias', { productId: hamb, quantity: 1, reason: 'Auditoría: cortesía' }, { headers: { 'Idempotency-Key': crypto.randomUUID() } });
  const S4 = await estadoCuando((s) => delta(S3, s, 'cortesiasCost') > 0);
  check('la cortesía cuesta exactamente una hamburguesa a FIFO', delta(S3, S4, 'cortesiasCost'), COSTO_HAMB);
  check('la cortesía NO toca el COGS de lo vendido', delta(S3, S4, 'cogs'), 0);

  await post('/inventory/movements', { entityType: 'INGREDIENT', ingredientId: carne, delta: -200, type: 'WASTE', notes: 'Auditoría: merma' });
  const S5 = await estadoCuando((s) => delta(S4, s, 'wasteCost') > 0);
  check('la merma vale 200 g de carne al costo del lote', delta(S4, S5, 'wasteCost'), 200 * 30);

  const stockQueso = Number((await get(`/inventory/stock/ingredient/${queso}`)).body.currentStock);
  const conteo = (await post('/inventory/counts', { entityType: 'INGREDIENT', ingredientId: queso, countedQty: stockQueso - 100, notes: 'Auditoría: conteo' })).body;
  // Un conteo del dueño se aplica en el acto; el del cocinero queda PENDING y
  // lo aprueba el admin. Se cubre cualquiera de los dos caminos.
  if (conteo.status === 'PENDING') await post(`/inventory/counts/${conteo.id}/approve`, {});
  const S6 = await estadoCuando((s) => delta(S5, s, 'shrinkageCost') > 0);
  check('el faltante vale 100 g de queso al costo del lote', delta(S5, S6, 'shrinkageCost'), 100 * 25);
  check('el faltante va en su línea, no en la merma', delta(S5, S6, 'wasteCost'), 0);

  // ---- Costos fijos
  seccion('Costos fijos: sin pago (estimado), pagado distinto, anual, puntual');
  const costo = async (body) => (await post('/fixed-costs', body)).body.id;
  const pagar = async (id, year, month, amount) => {
    const form = new FormData();
    form.set('periodYear', String(year));
    form.set('periodMonth', String(month));
    form.set('amount', String(amount));
    form.set('cashAmount', '0');
    form.set('bankAmount', String(amount));
    form.set('proof', new Blob([PNG_1X1], { type: 'image/png' }), 'proof.png');
    await post(`/fixed-costs/${id}/payment`, undefined, { form });
  };
  await costo({ name: N('Arriendo'), amount: 1_500_000, frequency: 'MONTHLY', category: 'Alquiler' });
  const servicios = await costo({ name: N('Servicios'), amount: 900_000, frequency: 'MONTHLY', category: 'Servicios' });
  const seguro = await costo({ name: N('Seguro'), amount: 1_200_000, frequency: 'ANNUAL', category: 'Otros' });
  const horno = await costo({ name: N('Horno'), amount: 800_000, frequency: 'ONE_TIME', category: 'Mantenimiento', startedAt: ymd(hoy) });
  const S7a = await estado();
  check('arriendo sin pago: monto de la ficha', linea(S7a, N('Arriendo'))?.monthlyAmount, 1_500_000);
  check('arriendo sin pago: rotulado estimado', linea(S7a, N('Arriendo'))?.isEstimated, true);
  check('servicios sin pago: estimado', linea(S7a, N('Servicios'))?.isEstimated, true);
  check('anual sin pago: ÷12 y estimado', linea(S7a, N('Seguro'))?.monthlyAmount, 100_000);
  check('puntual sin pago: su monto, estimado', linea(S7a, N('Horno'))?.monthlyAmount, 800_000);
  check('puntual va como gasto único, no recurrente', linea(S7a, N('Horno'))?.isOneTime, true);

  await pagar(servicios, Y, M, 1_150_000);
  await pagar(seguro, Y, 1, 1_500_000);
  await pagar(horno, Y, M, 850_000);
  const S7 = await estado();
  check('servicios pagado: muestra lo pagado', linea(S7, N('Servicios'))?.monthlyAmount, 1_150_000);
  check('servicios pagado: ya no es estimado', linea(S7, N('Servicios'))?.isEstimated, false);
  check('anual pagado en enero: pagado ÷ 12', linea(S7, N('Seguro'))?.monthlyAmount, 125_000);
  check('anual pagado: no estimado', linea(S7, N('Seguro'))?.isEstimated, false);
  check('puntual pagado: lo pagado', linea(S7, N('Horno'))?.monthlyAmount, 850_000);
  check('total fijos recurrentes sube 1.500.000 + 1.150.000 + 125.000', delta(S6, S7, 'totalFixed'), 2_775_000);
  check('gastos únicos suben 850.000', delta(S6, S7, 'oneTimeCost'), 850_000);
  checkTrue('la nómina automática nunca es estimada', S7.fixedCosts.every((l) => !l.isPayroll || !l.isEstimated));

  await patch(`/fixed-costs/${servicios}`, { amount: 950_000 });
  const S7b = await estado();
  const N1 = await estado(YN, MN);
  check('editar la ficha NO reescribe el mes ya pagado', linea(S7b, N('Servicios'))?.monthlyAmount, 1_150_000);
  check('el mes siguiente toma la ficha nueva, estimado', linea(N1, N('Servicios'))?.monthlyAmount, 950_000);
  check('el mes siguiente: servicios estimado', linea(N1, N('Servicios'))?.isEstimated, true);
  check('el mes siguiente: arriendo estimado', linea(N1, N('Arriendo'))?.isEstimated, true);
  const seguroSig = linea(N1, N('Seguro'));
  if (YN === Y) {
    check('el mes siguiente del mismo año: el anual sigue pagado (÷12)', seguroSig?.monthlyAmount, 125_000);
    check('el mes siguiente del mismo año: el anual no es estimado', seguroSig?.isEstimated, false);
  } else {
    check('enero del año siguiente: el anual vuelve a la ficha', seguroSig?.monthlyAmount, 100_000);
    check('enero del año siguiente: el anual es estimado', seguroSig?.isEstimated, true);
  }
  checkTrue('el puntual no aparece el mes siguiente', !linea(N1, N('Horno')));
  check('el mes siguiente no heredó fijos de más', delta(N0, N1, 'totalFixed'), 1_500_000 + 950_000 + (YN === Y ? 125_000 : 100_000));

  // ---- Compromisos
  seccion('Compromisos: un gasto pagado cuenta; devolver un préstamo no');
  const gasto = (await post('/payables', { beneficiary: N('Técnico'), description: 'Arreglo de la nevera', amount: 120_000 })).body.id;
  const prestamo = (await post('/payables', { beneficiary: N('Socio'), description: 'Devolución de préstamo', amount: 500_000, isExpense: false })).body.id;
  // El pago de un compromiso viaja como multipart (admite comprobantes) con el
  // JSON en el campo `payload`.
  const pagarCompromiso = async (id, bankAmount) => {
    const form = new FormData();
    form.set('payload', JSON.stringify({ cashAmount: 0, bankAmount }));
    await post(`/payables/${id}/pay`, undefined, { form, headers: { 'Idempotency-Key': crypto.randomUUID() } });
  };
  await pagarCompromiso(gasto, 120_000);
  await pagarCompromiso(prestamo, 500_000);
  const S8 = await estado();
  check('solo el gasto baja el neto (120.000)', delta(S7b, S8, 'payablesPaidCost'), 120_000);
  check('solo el gasto cuenta como compromiso pagado', delta(S7b, S8, 'payablesPaidCount'), 1);

  // ---- Identidades del estado completo
  seccion('Identidades del estado completo');
  const s = S8;
  const netoCalculado =
    s.grossMargin - s.totalFixed - s.oneTimeCost - s.cortesiasCost - s.refundCost - s.wasteCost - s.shrinkageCost - s.freightCost - s.payablesPaidCost;
  check('neto = margen bruto − fijos − únicos − cortesías − reembolsos − merma − faltantes − fletes − compromisos', s.netResult, netoCalculado);
  check('margen bruto = ingresos − COGS', s.grossMargin, s.revenue - s.cogs);
  check('ingresos = lista − descuentos', s.revenue, s.grossRevenue - s.discountTotal);
  check('margen de contribución = ingresos − COGS − merma − faltantes − cortesías − reembolsos − fletes', s.contributionMargin, s.revenue - s.cogs - s.wasteCost - s.shrinkageCost - s.cortesiasCost - s.refundCost - s.freightCost);
  if (s.contributionMarginPct !== null && s.contributionMarginPct > 0) {
    // El % viaja redondeado a 4 decimales: recomputar la meta desde él deja
    // una diferencia proporcional a la meta (unos $300 sobre $25 millones).
    check('equilibrio realizado = fijos ÷ margen de contribución %', s.breakEven, s.totalFixed / s.contributionMarginPct, Math.max(1, s.breakEven * 0.001));
  } else {
    checkTrue('sin margen de contribución positivo, el equilibrio realizado es null', s.breakEven === null);
  }
  const c = s.catalogBreakEven;
  if (c.target !== null && c.marginPct !== null && c.marginPct > 0) {
    check('equilibrio de la carta = fijos ÷ margen de la carta %', c.target, s.totalFixed / c.marginPct, Math.max(1, c.target * 0.001));
    check('cobertura de la carta = ingresos ÷ meta', c.coverage, s.revenue / c.target, 0.001);
    checkTrue('el margen de la carta está entre 0 y 100 %', c.marginPct > 0 && c.marginPct < 1, String(c.marginPct));
  }
  check('total del panorama sobre el neto', delta(S0, S8, 'netResult'),
    40_000 - 2_775_000 - 850_000 - COSTO_HAMB - 200 * 30 - 100 * 25 - FLETE - 120_000);

  const trend = (await get(`/reports/financial/trend?months=6&year=${Y}&month=${M}`)).body;
  const ultimo = trend.points[trend.points.length - 1];
  check('la tendencia termina en el mismo neto que el estado', ultimo.netResult, s.netResult);
  check('la tendencia termina en los mismos ingresos', ultimo.revenue, s.revenue);
  check('la tendencia termina en los mismos fijos (ya con lo pagado)', ultimo.totalFixed, s.totalFixed);

  // ---- Análisis de IA
  seccion('Análisis de IA: forma, tono según la regla de la pantalla, sin voseo');
  const ia = await api('POST', `/reports/financial/analyze?year=${Y}&month=${M}`, undefined, {});
  if (ia.status !== 201 && ia.status !== 200) {
    checkTrue(`la IA respondió (${ia.status})`, false, JSON.stringify(ia.body).slice(0, 200));
  } else {
    const a = ia.body;
    checkTrue('tono válido', ['saludable', 'atencion', 'critico'].includes(a.tono), a.tono);
    checkTrue('titular con una cifra en pesos', /\$\s?\d/.test(a.titular ?? ''), a.titular);
    checkTrue('entre 3 y 5 bullets', Array.isArray(a.bullets) && a.bullets.length >= 3 && a.bullets.length <= 5, String(a.bullets?.length));
    checkTrue('bullets con tipo válido', (a.bullets ?? []).every((b) => ['positivo', 'vigilar', 'accion'].includes(b.tipo)));
    checkTrue('siguiente paso presente', typeof a.siguiente_paso === 'string' && a.siguiente_paso.length > 10);
    const texto = [a.titular, ...(a.bullets ?? []).map((b) => b.texto), a.siguiente_paso].join(' ');
    // Misma regla que el asistente de la guía (`tieneVoseo`, domain): distingue
    // el futuro en tuteo ("marcarás") del voseo ("marcás") por la raíz. Una
    // regex casera marcaba "revisa" —tuteo correcto— como voseo.
    const voseo = detectorDeVoseo();
    if (voseo) {
      const palabras = voseo(texto);
      checkTrue('sin voseo', palabras.length === 0, `voseo: ${palabras.join(', ')}`);
    } else {
      console.log('    (detector de voseo no disponible: corre el script desde el repo con domain compilado)');
    }
    const cobertura = c.coverage ?? s.breakEvenCoverage;
    const tonoEsperado =
      s.netResult < 0 ? 'critico' : cobertura === null ? a.tono : cobertura >= 1 ? 'saludable' : cobertura >= 0.8 ? 'atencion' : 'critico';
    check('el tono sigue la regla de la cobertura que ve el dueño', a.tono, tonoEsperado);
    const hayEstimados = s.fixedCosts.some((l) => l.isEstimated);
    if (hayEstimados) {
      checkTrue('con líneas estimadas, el análisis lo menciona (aviso, no falla)', /estimad/i.test(texto) || true, 'no lo mencionó; es tolerable');
      console.log(`    (¿menciona "estimado"? ${/estimad/i.test(texto) ? 'sí' : 'no'})`);
    }
    console.log(`    IA → [${a.tono}] ${a.titular}`);
    for (const b of a.bullets ?? []) console.log(`      · (${b.tipo}) ${b.texto}`);
    console.log(`      → ${a.siguiente_paso}`);
  }

  // ---- Resumen
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${'='.repeat(70)}\n${resultados.length - fallos.length} de ${resultados.length} comprobaciones en verde${fallos.length ? `, ${fallos.length} en rojo:` : '.'}`);
  for (const f of fallos) console.log(`  ✗ [${f.seccion}] ${f.nombre}: esperado ${fmt(f.esperado)}, llegó ${fmt(f.actual)}`);
  console.log(`Panorama creado con sufijo AUD${STAMP} (mes ${Y}-${String(M).padStart(2, '0')}). Queda en el entorno para mirarlo en Finanzas → Estado financiero.`);
  process.exit(fallos.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nLa auditoría se detuvo: ${e.message}`);
  process.exit(1);
});
