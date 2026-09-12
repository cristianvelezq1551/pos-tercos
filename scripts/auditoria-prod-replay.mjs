#!/usr/bin/env node
/**
 * Replay de solo lectura del ledger de producción sobre VOLCADOS en disco.
 *
 * No se conecta a ninguna base: recorre los JSON exportados con `psql` usando
 * el MISMO motor que usa el API (`packages/domain/dist`) y comprueba, contra
 * los datos reales, las leyes que el negocio da por ciertas. El informe que
 * salió de acá es `AUDITORIA-PROD-2026-09-11.md`.
 *
 *   DUMPS=/ruta/con/los/json [CUTOFF=2026-09-11T03:33:03.100Z] \
 *   node scripts/auditoria-prod-replay.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require(path.join(R, 'packages/domain/dist'));
const T = require(path.join(R, 'packages/types/dist'));
const S = process.env.DUMPS ?? path.join(R, 'tmp', 'auditoria');
const J = (n) => require(path.join(S, n + '.json'));
const CUTOFF = process.env.CUTOFF ? new Date(process.env.CUTOFF) : null; // ISO UTC
const N = (x) => (x === null || x === undefined ? null : Number(x));
const utc = (s) => (s ? new Date(s.endsWith('Z') ? s : s + 'Z') : null);
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
const fmt = (n) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('es-CO'));
const fails = []; let checks = 0;
const ok = (cond, msg, detail) => { checks++; if (!cond) fails.push(msg + (detail ? ' :: ' + detail : '')); console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (detail && !cond ? '\n      ' + detail : '')); };
const H = (t) => console.log('\n' + '='.repeat(96) + '\n' + t + '\n' + '='.repeat(96));

// ---------- datos ----------
let movs = J('movs5').map((m) => ({
  id: m.id, createdAt: utc(m.created_at), delta: N(m.delta), type: m.type,
  unitCost: N(m.unit_cost), ...(m.unit_cost_estimated ? { unitCostEstimated: true } : {}),
  sourceType: m.source_type, sourceId: m.source_id, entityType: m.entity_type,
  ingredientId: m.ingredient_id, productId: m.product_id, subproductId: m.subproduct_id, notes: m.notes,
}));
let sales = J('sales_full');
let cortesias = J('cortesias');
const products = J('products'), ingredients = J('ingredients'), subproducts = J('subproducts');
const edges = J('recipe_edges'), invoices = J('invoices'), counts = J('stock_counts');
const fixed = J('fixed'), usersPay = J('users_pay'), payroll = J('payroll'), payables = J('payables');
const snap = J('snapshot')[0];
if (CUTOFF) {
  movs = movs.filter((m) => m.createdAt <= CUTOFF);
  sales = sales.filter((s) => !s.paid_at || utc(s.paid_at) <= CUTOFF);
  cortesias = cortesias.filter((c) => utc(c.created_at) <= CUTOFF);
  console.log('CORTE aplicado:', CUTOFF.toISOString());
}
movs.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
const keyOf = (m) => `${m.entityType}:${m.ingredientId ?? m.productId ?? m.subproductId}`;
const nameByKey = new Map();
for (const i of ingredients) nameByKey.set('INGREDIENT:' + i.id, i.name);
for (const p of products) nameByKey.set('PRODUCT:' + p.id, p.name);
for (const s of subproducts) nameByKey.set('SUBPRODUCT:' + s.id, s.name);
const nm = (k) => nameByKey.get(k) ?? k;
const prodById = new Map(products.map((p) => [p.id, p]));
const subById = new Map(subproducts.map((s) => [s.id, s]));

// ---------- grafo de recetas (espejo de RecipesService) ----------
const blocksDefault = new Map();
for (const i of ingredients) blocksDefault.set('i:' + i.id, i.blocks_availability);
for (const s of subproducts) blocksDefault.set('s:' + s.id, s.blocks_availability);
const node = (e, parent) => {
  const child = e.child_ingredient_id ? { kind: 'ingredient', id: e.child_ingredient_id } : { kind: 'subproduct', id: e.child_subproduct_id };
  const ck = (child.kind === 'ingredient' ? 'i:' : 's:') + child.id;
  return { parent, child, quantityNeta: N(e.quantity_neta), mermaPct: N(e.merma_pct), blocksAvailability: e.blocks_availability ?? blocksDefault.get(ck) ?? true };
};
const baseEdges = new Map(); const sizeEdges = new Map();
for (const e of edges) {
  if (e.parent_size_id) { const l = sizeEdges.get(e.parent_size_id) ?? []; l.push(e); sizeEdges.set(e.parent_size_id, l); continue; }
  const parent = e.parent_product_id ? { kind: 'product', id: e.parent_product_id } : { kind: 'subproduct', id: e.parent_subproduct_id };
  const k = (parent.kind === 'product' ? 'p:' : 's:') + parent.id;
  const l = baseEdges.get(k) ?? []; l.push(node(e, parent)); baseEdges.set(k, l);
}
const graphFor = (productId, sizeId) => {
  const ebp = new Map(baseEdges);
  if (sizeId && sizeEdges.has(sizeId)) {
    const k = 'p:' + productId;
    ebp.set(k, [...(ebp.get(k) ?? []), ...sizeEdges.get(sizeId).map((e) => node(e, { kind: 'product', id: productId }))]);
  }
  return {
    products: new Map(products.map((p) => [p.id, { id: p.id, name: p.name }])),
    subproducts: new Map(subproducts.map((s) => [s.id, { id: s.id, name: s.name, yield: N(s.yield) }])),
    ingredients: new Map(ingredients.map((i) => [i.id, { id: i.id, name: i.name, unitRecipe: i.unit_recipe }])),
    edgesByParent: ebp,
  };
};
const baseGraph = graphFor(null, null);
const modById = new Map(); for (const p of products) for (const m of p.modifiers ?? []) modById.set(m.id, m);

/** Espejo de computeConsumptionSpecs: consumo agregado por clave TYPE:id. */
function expectedConsumption(lines) {
  const out = new Map();
  const add = (k, q) => out.set(k, (out.get(k) ?? 0) + q);
  const consume = (p, qty, sizeId) => {
    if (p.direct_resale) { add('PRODUCT:' + p.id, qty); return; }
    const ex = D.expandRecipeOneLevel(graphFor(p.id, sizeId), { kind: 'product', id: p.id }, qty);
    for (const i of ex.ingredients.values()) add('INGREDIENT:' + i.ingredientId, i.totalQuantity);
    for (const s of ex.subproducts.values()) add('SUBPRODUCT:' + s.subproductId, s.totalQuantity);
  };
  for (const l of lines) {
    const p = prodById.get(l.productId); if (!p) { add('MISSING:' + l.productId, l.quantity); continue; }
    for (const m of l.modifiers ?? []) { const def = modById.get(m.modifierId); if (!def) continue; for (const c of def.recipeDelta ?? []) add((c.childType === 'ingredient' ? 'INGREDIENT:' : 'SUBPRODUCT:') + c.childId, c.quantity * l.quantity); }
    if (p.is_combo) for (const c of p.components ?? []) consume(prodById.get(c.productId), l.quantity * N(c.quantity), null);
    else consume(p, l.quantity, l.sizeId);
  }
  return out;
}
const movsBySource = new Map();
for (const m of movs) { if (!m.sourceType || !m.sourceId) continue; const k = m.sourceType + '|' + m.sourceId; const l = movsBySource.get(k) ?? []; l.push(m); movsBySource.set(k, l); }
const sumByKey = (list) => { const o = new Map(); for (const m of list) o.set(keyOf(m), r4((o.get(keyOf(m)) ?? 0) + m.delta)); return o; };
const diffMaps = (exp, got, sign) => { const d = []; const keys = new Set([...exp.keys(), ...got.keys()]); for (const k of keys) { const e = r4((exp.get(k) ?? 0) * sign), g = got.get(k) ?? 0; if (Math.abs(e - g) > 0.001) d.push(`${nm(k)} esperado ${e} registrado ${g}`); } return d; };

// ====================================================================
H('A. CONSUMO POR VENTA — receta vigente (tamaño, extras, combo) vs movimientos registrados');
let salesChecked = 0, salesBad = [], salesEditadas = 0, salesEditadasDetalle = [];
const stampOf = new Map();
for (const e of edges) { const k = e.parent_product_id ? 'p:' + e.parent_product_id : e.parent_size_id ? 'z:' + e.parent_size_id : 's:' + e.parent_subproduct_id; const t = utc(e.created_at); if (!stampOf.has(k) || stampOf.get(k) < t) stampOf.set(k, t); }
const recipeStamp = (items) => { let t = null; const bump = (k) => { const v = stampOf.get(k); if (v && (!t || v > t)) t = v; }; for (const it of items) { const p = prodById.get(it.productId); if (!p) continue; if (p.is_combo) for (const c of p.components ?? []) bump('p:' + c.productId); else { bump('p:' + p.id); if (it.sizeId) bump('z:' + it.sizeId); } } return t; };
const NONREV = new Set(T.NON_REVENUE_SALE_STATUSES);
for (const s of sales) {
  const got = sumByKey(movsBySource.get('sale|' + s.id) ?? []);
  if (s.status === 'PENDIENTE_PAGO' || s.status === 'CANCELADO_NO_PAGO') { if (got.size) salesBad.push(`#${s.receipt_number} sin cobrar pero con movimientos`); continue; }
  const isRefund = s.status === 'VOID' && (s.void_reason ?? '').startsWith(T.REFUND_VOID_REASON_PREFIX);
  const exp = s.status === 'VOID' && !isRefund ? new Map() : expectedConsumption(s.items ?? []);
  const d = diffMaps(exp, got, -1);
  salesChecked++;
  const stamp = recipeStamp(s.items ?? []);
  if (d.length && stamp && s.paid_at && stamp > utc(s.paid_at)) { salesEditadas++; salesEditadasDetalle.push(`#${s.receipt_number} receta editada ${stamp.toISOString().slice(0, 16)} > cobro ${s.paid_at.slice(0, 16)}`); continue; }
  if (d.length) salesBad.push(`#${s.receipt_number} (${s.status}): ` + d.join(' · '));
}
console.log(`  ${salesEditadas} ventas difieren de la receta de HOY porque la receta se editó DESPUÉS del cobro (esperado: el consumo usa la receta vigente al cobrar):\n     ` + salesEditadasDetalle.slice(0, 6).join('\n     ') + (salesEditadasDetalle.length > 6 ? `\n     … y ${salesEditadasDetalle.length - 6} más` : ''));
ok(salesBad.length === 0, `${salesChecked - salesEditadas} ventas cobradas/anuladas: movimientos = receta vigente × cantidad (tamaño + extras + combos)`, salesBad.slice(0, 12).join('\n      '));
// Mozarella spotlight
const MOZ = ingredients.find((i) => /mozarella/i.test(i.name));
if (MOZ) {
  const k = 'INGREDIENT:' + MOZ.id;
  console.log(`\n  Queso mozarella (${MOZ.unit_recipe}): quién lo consume según receta →`);
  for (const p of products) for (const sz of [null, ...(p.sizes ?? []).map((x) => x.id)]) { if (p.is_combo || p.direct_resale) continue; const ex = expectedConsumption([{ productId: p.id, quantity: 1, sizeId: sz }]); if (ex.get(k)) console.log(`     ${p.name}${sz ? ' · ' + p.sizes.find((x) => x.id === sz).name : ''}: ${ex.get(k)} g por unidad`); }
  const byDay = new Map();
  for (const m of movs.filter((m) => keyOf(m) === k)) { const day = m.createdAt.toISOString().slice(0, 10); const o = byDay.get(day) ?? { venta: 0, cortesia: 0, prod: 0, merma: 0, conteo: 0, ajuste: 0, compra: 0 }; const b = m.sourceType === 'sale' ? 'venta' : m.sourceType === 'cortesia' ? 'cortesia' : m.sourceType === 'production' ? 'prod' : m.type === 'WASTE' ? 'merma' : m.sourceType === 'stock_count' ? 'conteo' : m.type === 'PURCHASE' ? 'compra' : 'ajuste'; o[b] += m.delta; byDay.set(day, o); }
  let run = 0; for (const [day, o] of [...byDay.entries()].sort()) { run += Object.values(o).reduce((a, b) => a + b, 0); console.log(`     ${day} (UTC) compra ${o.compra} · venta ${o.venta} · cortesía ${o.cortesia} · producción ${o.prod} · merma ${o.merma} · conteo ${o.conteo} · ajuste ${o.ajuste} → saldo ${r4(run)}`); }
  const sold = sales.filter((s) => s.status === 'PAGADO').flatMap((s) => (s.items ?? []).map((i) => ({ s, i }))).filter((x) => expectedConsumption([x.i]).get(k)).length;
  const movSales = movs.filter((m) => keyOf(m) === k && m.sourceType === 'sale').length;
  ok(sold === movSales, `mozarella: ${sold} líneas vendidas que lo llevan ↔ ${movSales} movimientos de venta`);
}

// ====================================================================
H('B. CORTESÍAS — consumo registrado vs receta, y los TRES costos (guardado al crear · FIFO · de hoy)');
const ingCostHoy = new Map(ingredients.map((i) => [i.id, i.last_unit_cost !== null && N(i.conversion_factor) > 0 ? N(i.last_unit_cost) / N(i.conversion_factor) : null]));
const costoHoy = (productId, sizeId) => {
  const p = prodById.get(productId);
  if (p.is_combo) { const comps = (p.components ?? []).map((c) => ({ productId: c.productId, productName: prodById.get(c.productId)?.name ?? '?', quantity: N(c.quantity), unitCost: costoHoy(c.productId, null), missingReason: null })); return D.computeComboCost({ components: comps }).totalCost; }
  return D.computeProductCost({ product: { id: p.id, name: p.name, directResale: p.direct_resale, lastUnitCost: N(p.last_unit_cost), conversionFactor: N(p.conversion_factor), isCombo: false }, recipe: p.direct_resale ? null : { graph: graphFor(p.id, sizeId), root: { kind: 'product', id: p.id } }, ingredientCosts: ingCostHoy }).totalCost;
};
let cortBad = [];
for (const c of cortesias) {
  const got = sumByKey(movsBySource.get('cortesia|' + c.id) ?? []);
  const rev = sumByKey(movsBySource.get('cortesia_reversal|' + c.id) ?? []);
  const exp = c.status === 'APPROVED' ? expectedConsumption([{ productId: c.product_id, quantity: c.quantity, sizeId: c.size_id }]) : new Map();
  const d = diffMaps(exp, got, -1);
  if (c.status === 'REVERSED') for (const [k, v] of got) if (Math.abs(v + (rev.get(k) ?? 0)) > 0.001) d.push(`${nm(k)} reversa incompleta`);
  const stampC = recipeStamp([{ productId: c.product_id, sizeId: c.size_id }]);
  if (d.length && stampC && stampC > utc(c.created_at)) { console.log(`  (receta editada después) ${c.id.slice(0, 8)} ${prodById.get(c.product_id)?.name}: ` + d.join(' · ')); continue; }
  if (d.length) cortBad.push(`${c.id.slice(0, 8)}: ` + d.join(' · '));
}
ok(cortBad.length === 0, `${cortesias.length} cortesías: movimientos = receta × cantidad (y la reversa devuelve lo mismo)`, cortBad.join('\n      '));

// ---------- motor FIFO ----------
const fallback = {};
for (const i of ingredients) if (i.last_unit_cost !== null && N(i.conversion_factor) > 0) fallback['INGREDIENT:' + i.id] = N(i.last_unit_cost) / N(i.conversion_factor);
for (const p of products) if (p.direct_resale && p.last_unit_cost !== null) { const f = p.conversion_factor !== null ? N(p.conversion_factor) : 1; if (f > 0) fallback['PRODUCT:' + p.id] = N(p.last_unit_cost) / f; }
const full = D.runLedgerFifo(movs, undefined, { fallbackUnitCost: fallback });
const cutoffAt = utc(snap.cutoff_at);
const inc = D.runLedgerFifo(movs.filter((m) => m.createdAt >= cutoffAt), snap.payload, { fallbackUnitCost: fallback });
const saleCost = (L, id) => { let cost = 0, unknownQty = 0, estimatedQty = 0; for (const m of [L.saleIngredientCost, L.saleProductCost, L.saleSubproductCost]) for (const e of m.get(id)?.values() ?? []) { cost += e.cost; unknownQty += e.unknownQty; estimatedQty += e.estimatedQty; } return { cost, unknownQty, estimatedQty }; };

// ====================================================================
H('C. MOTOR FIFO — conservación de unidades, incremental (snapshot de prod) = replay completo, lotes sin costo');
const sumDelta = new Map(); for (const m of movs) sumDelta.set(keyOf(m), r4((sumDelta.get(keyOf(m)) ?? 0) + m.delta));
let consBad = [];
for (const [k, q] of sumDelta) { const r = full.remaining.get(k); const rq = r ? r.qty : 0; const debt = (full.endingDebts[k] ?? []).reduce((a, d) => a + d.qty, 0); if (Math.abs(Math.max(q, 0) - rq) > 0.01 || (q < 0 && Math.abs(-q - debt) > 0.01)) consBad.push(`${nm(k)}: Σdelta ${q} · motor ${r4(rq)} restante / ${r4(debt)} deuda`); }
ok(consBad.length === 0, `conservación: para los ${sumDelta.size} stockables, unidades restantes del motor (o deuda si negativo) = Σ movimientos`, consBad.join('\n      '));
ok(!inc.needsFullReplay, 'el replay incremental con el snapshot de prod NO cae a replay completo (ninguna reversa cruza el corte)');
let incBad = [];
for (const [k, r] of full.remaining) { const i = inc.remaining.get(k); if (!i || Math.abs(i.qty - r.qty) > 0.001 || Math.abs(i.value - r.value) > 0.5 || Math.abs(i.unknownQty - r.unknownQty) > 0.001) incBad.push(`${nm(k)} full ${r4(r.qty)}/$${fmt(r.value)} inc ${i ? r4(i.qty) + '/$' + fmt(i.value) : 'ausente'}`); }
ok(incBad.length === 0, 'valuación restante: incremental (seed) = replay completo, stockable por stockable', incBad.join('\n      '));
const monthStart = new Date(Date.UTC(2026, 8, 1, 5)), monthEnd = new Date(Date.UTC(2026, 9, 1, 4, 59, 59, 999));
const septSales = sales.filter((s) => s.paid_at && utc(s.paid_at) >= monthStart && utc(s.paid_at) <= monthEnd && !NONREV.has(s.status));
let cogsFull = 0, cogsInc = 0; for (const s of septSales) { cogsFull += saleCost(full, s.id).cost; cogsInc += saleCost(inc, s.id).cost; }
ok(Math.abs(cogsFull - cogsInc) < 0.5, `COGS de septiembre: incremental ${fmt(cogsInc)} = completo ${fmt(cogsFull)}`);
const negativos = [...sumDelta].filter(([, q]) => q < -0.001).map(([k, q]) => `${nm(k)} ${q}`);
console.log('  stock negativo hoy (deuda): ' + (negativos.join(' · ') || 'ninguno'));
const totUnknown = [...full.remaining.values()].reduce((a, r) => a + r.unknownQty, 0);
console.log(`  unidades restantes SIN costo conocido (lotes a null): ${r4(totUnknown)} → valuación total $${fmt([...full.remaining.values()].reduce((a, r) => a + r.value, 0))}`);
const lotsNull = []; for (const [k, lots] of full.remainingLots) { const u = lots.filter((l) => l.unitCost === null).reduce((a, l) => a + l.qty, 0); if (u > 0.001) lotsNull.push(`${nm(k)} ${r4(u)}`); }
console.log('  stockables con lotes sin costo en el inventario actual: ' + (lotsNull.join(' · ') || 'ninguno'));
// origen de los lotes sin costo
const entradasSinCosto = movs.filter((m) => m.delta > 0 && m.unitCost === null && !['sale', 'cortesia_reversal', 'waste_reversal', 'production', 'invoice_reversal'].includes(m.sourceType ?? '') && m.type !== 'PRODUCTION');
const porOrigen = {}; for (const m of entradasSinCosto) { const o = m.sourceType ?? m.type; porOrigen[o] = (porOrigen[o] ?? 0) + 1; }
console.log('  entradas SIN precio (crean lote a null): ' + JSON.stringify(porOrigen) + ` · ${movs.filter((m) => m.unitCostEstimated).length} entradas ya estimadas por la Fase 2`);

// ====================================================================
H('D. PRODUCCIÓN — cada tanda consume N/yield × receta del subproducto');
const runs = new Map(); for (const m of movs.filter((m) => m.sourceType === 'production')) { const l = runs.get(m.sourceId) ?? []; l.push(m); runs.set(m.sourceId, l); }
let prodBad = [];
for (const [runId, rows] of runs) {
  const plus = rows.find((r) => r.delta > 0 && r.entityType === 'SUBPRODUCT'); if (!plus) { prodBad.push(runId + ' sin +N'); continue; }
  const sub = subById.get(plus.subproductId);
  const ex = D.expandRecipeOneLevel(baseGraph, { kind: 'subproduct', id: sub.id }, plus.delta / N(sub.yield));
  const exp = new Map(); for (const i of ex.ingredients.values()) exp.set('INGREDIENT:' + i.ingredientId, r4(i.totalQuantity)); for (const s of ex.subproducts.values()) exp.set('SUBPRODUCT:' + s.subproductId, r4(s.totalQuantity));
  const got = sumByKey(rows.filter((r) => r !== plus));
  const d = []; for (const k of new Set([...exp.keys(), ...got.keys()])) { const e = -(exp.get(k) ?? 0), g = got.get(k) ?? 0; if (Math.abs(e - g) > 0.002 && !(Math.abs(e) < 0.00005)) d.push(`${nm(k)} esperado ${e} registrado ${g}`); }
  const stampS = stampOf.get('s:' + sub.id);
  if (d.length && stampS && stampS > plus.createdAt) { console.log(`  (receta editada después: ${stampS.toISOString().slice(0, 16)} > tanda ${plus.createdAt.toISOString().slice(0, 16)}) ${sub.name} × ${plus.delta}: ` + d.join(' · ')); continue; }
  if (d.length) prodBad.push(`${sub.name} × ${plus.delta}: ` + d.join(' · '));
}
ok(prodBad.length === 0, `${runs.size} tandas de producción consumen exactamente N/yield × receta (receta VIGENTE; una receta editada después mostraría diferencia)`, prodBad.slice(0, 8).join('\n      '));
const lotesSub = []; for (const s of subproducts) { const lots = full.remainingLots.get('SUBPRODUCT:' + s.id) ?? []; if (lots.length) lotesSub.push(`${s.name}: ` + lots.map((l) => `${r4(l.qty)}@${l.unitCost === null ? 'null' : l.unitCost.toFixed(2)}`).join(', ')); }
console.log('  lotes vivos de subproductos (cantidad@costo unitario FIFO):\n     ' + lotesSub.join('\n     '));

// ====================================================================
H('E. CONTEOS — lo que el sistema mostró como "esperado" era la suma de movimientos hasta ese instante');
let cntBad = 0; for (const c of counts) { const k = `${c.entity_type}:${c.ingredient_id ?? c.product_id ?? c.subproduct_id}`; const at = utc(c.created_at); let q = 0; for (const m of movs) if (keyOf(m) === k && m.createdAt < at) q += m.delta; if (Math.abs(r4(q) - N(c.ledger_qty)) > 0.001) { cntBad++; if (cntBad <= 5) console.log(`     ${nm(k)} ${c.created_at}: mostró ${c.ledger_qty}, movimientos daban ${r4(q)}`); } }
ok(cntBad === 0, `${counts.length} conteos: ledger_qty guardado = Σ movimientos previos (${cntBad} distintos)`);
const shrinkTotal = full.shrinkage.filter((f) => f.createdAt >= monthStart.toISOString() && f.createdAt <= monthEnd.toISOString());
console.log(`  faltantes de conteo valorizados en septiembre: $${fmt(shrinkTotal.reduce((a, f) => a + f.cost, 0))} (estimado $${fmt(shrinkTotal.reduce((a, f) => a + f.estimatedCost, 0))}, sin costo ${r4(shrinkTotal.reduce((a, f) => a + f.unknownQty, 0))} u)`);

// ====================================================================
H('F. MERMAS — impacto en stock, costo FIFO, y presencia en el estado del mes');
const wastes = movs.filter((m) => m.type === 'WASTE');
for (const w of wastes) {
  const e = full.wasteCostByMovement.get(w.id);
  const rev = movs.filter((m) => m.sourceType === 'waste_reversal' && m.sourceId === w.id).reduce((a, m) => a + m.delta, 0);
  console.log(`  ${w.createdAt.toISOString().slice(0, 16)} ${nm(keyOf(w))} ${w.delta} → costo FIFO $${fmt(e?.cost)}${e?.unknownQty ? ' · sin costo ' + r4(e.unknownQty) + ' u' : ''}${e?.estimatedCost ? ' · estimado $' + fmt(e.estimatedCost) : ''}${rev ? ' · anulada ' + rev : ''} · "${w.notes ?? ''}"`);
}
const wasteSept = full.waste.filter((w) => w.createdAt >= monthStart.toISOString() && w.createdAt <= monthEnd.toISOString());
ok(Math.abs(wasteSept.reduce((a, w) => a + w.cost, 0) - [...full.wasteCostByMovement.values()].reduce((a, e) => a + e.cost, 0)) < 0.5, `merma del mes en el P&G ($${fmt(wasteSept.reduce((a, w) => a + w.cost, 0))}) = Σ costo por movimiento de merma`);
ok(wastes.every((w) => w.delta < 0), 'toda merma es negativa (baja el stock)');

// ====================================================================
H('G. ESTADO FINANCIERO DE SEPTIEMBRE — recomputado con el motor y las mismas reglas del servicio');
let revenue = 0, discount = 0, cogs = 0, unk = 0, est = 0, delivery = 0, deliveryN = 0;
for (const s of septSales) { const fee = N(s.delivery_fee) ?? 0; revenue += N(s.total) - fee; discount += N(s.discount_total) ?? 0; if (fee > 0) { delivery += fee; deliveryN++; } const c = saleCost(full, s.id); cogs += c.cost; unk += c.unknownQty; est += c.estimatedQty; }
const refunds = sales.filter((s) => s.status === 'VOID' && (s.void_reason ?? '').startsWith(T.REFUND_VOID_REASON_PREFIX) && utc(s.paid_at) >= monthStart);
const refundCost = refunds.reduce((a, s) => a + saleCost(full, s.id).cost, 0);
const wasteCost = r2(wasteSept.reduce((a, w) => a + w.cost, 0));
const shrinkageCost = r2(shrinkTotal.reduce((a, f) => a + f.cost, 0));
const cortAppr = cortesias.filter((c) => c.status === 'APPROVED' && utc(c.resolved_at) >= monthStart && utc(c.resolved_at) <= monthEnd);
let cortCost = 0, cortUnk = 0, cortEst = 0; for (const c of cortAppr) { const e = full.cortesiaCostBySource.get(c.id); cortCost += e?.cost ?? 0; cortUnk += e?.unknownQty ?? 0; cortEst += e?.estimatedCost ?? 0; }
const invSept = invoices.filter((i) => i.status === 'CONFIRMED' && utc(i.confirmed_at) >= monthStart && utc(i.confirmed_at) <= monthEnd);
const freight = r2(invSept.reduce((a, i) => a + N(i.freight_amount), 0));
// nómina DAILY espejo de computeMonthlyBase
const startDay = '2026-09-01', endDay = '2026-09-30';
const overrides = new Map(payroll.filter((p) => p.k === 'day').map((p) => [p.user_id + '|' + p.d, N(p.amount)]));
let payrollAmount = 0; const payrollDetail = [];
for (const u of usersPay) {
  if (!u.pay_type || u.salary_amount === null) continue;
  const hire = u.hire_date ? u.hire_date.slice(0, 10) : startDay; const term = u.termination_date ? u.termination_date.slice(0, 10) : endDay;
  const eff0 = hire > startDay ? hire : startDay, eff1 = term < endDay ? term : endDay; if (eff0 > eff1) continue;
  const rest = new Set(u.rest_days_of_week ?? []); let base = 0, days = 0;
  if (u.pay_type === 'MONTHLY') { base = N(u.salary_amount); }
  else { let week = D.payrollWeekFor(new Date(eff0 + 'T00:00:00.000Z')); let g = 0; while (week.weekStart <= eff1 && g++ < 60) { for (const d of week.days) { if (d.date < eff0 || d.date > eff1) continue; const ov = overrides.get(u.id + '|' + d.date); if (ov !== undefined) { base += ov; days++; continue; } if (rest.has(d.weekday) && !d.isHoliday) continue; if (d.status === 'WORKDAY') { base += N(u.salary_amount); days++; } } const next = D.payrollWeekFor(new Date(D.nextWeekRef(week) + 'T00:00:00.000Z')); if (next.weekStart === week.weekStart) break; week = next; } }
  payrollAmount += base; payrollDetail.push(`${u.email} ${u.pay_type} $${fmt(N(u.salary_amount))} × ${days} días = $${fmt(base)}`);
}
for (const a of payroll.filter((p) => p.k === 'adj')) if (a.d >= startDay && a.d <= endDay) payrollAmount += N(a.amount);
console.log('  nómina (auto): ' + payrollDetail.join(' · '));
// costos fijos efectivos
const lines = [];
if (payrollAmount > 0) lines.push({ name: 'Nómina (auto)', amount: r2(payrollAmount), oneTime: false, est: false });
for (const c of fixed) {
  if (!c.is_active) continue; const st = c.started_at ? c.started_at.slice(0, 10) : null, en = c.ended_at ? c.ended_at.slice(0, 10) : null;
  if ((st && st > endDay) || (en && en < startDay)) continue;
  const period = c.frequency === 'ANNUAL' ? { y: 2026, m: 1 } : c.frequency === 'ONE_TIME' && st ? { y: +st.slice(0, 4), m: +st.slice(5, 7) } : { y: 2026, m: 9 };
  const pay = (c.payments ?? []).find((p) => p.year === period.y && p.month === period.m);
  const base = pay ? N(pay.amount) : N(c.amount);
  lines.push({ name: c.name, amount: r2(c.frequency === 'ANNUAL' ? base / 12 : base), oneTime: c.frequency === 'ONE_TIME', est: !pay, freq: c.frequency });
}
for (const l of lines) console.log(`     ${l.name.padEnd(28)} $${fmt(l.amount).padStart(12)} ${l.oneTime ? 'ÚNICO' : (l.freq ?? 'recurrente')}${l.est ? ' (estimado: sin pago registrado)' : ' (pagado)'}`);
const totalFixed = r2(lines.filter((l) => !l.oneTime).reduce((a, l) => a + l.amount, 0));
const oneTime = r2(lines.filter((l) => l.oneTime).reduce((a, l) => a + l.amount, 0));
const payablesPaid = r2(payables.filter((p) => p.status === 'PAID' && p.is_expense && utc(p.paid_at) >= monthStart && utc(p.paid_at) <= monthEnd).reduce((a, p) => a + N(p.amount), 0));
const grossMargin = revenue - cogs;
const net = r2(grossMargin - totalFixed - oneTime - cortCost - refundCost - wasteCost - shrinkageCost - freight - payablesPaid);
const breakEvenBase = r2(totalFixed + oneTime + payablesPaid);
const be = D.computeBreakEven({ revenue, cogs, wasteCost, shrinkageCost, cortesiaCost: cortCost, refundCost, freightCost: freight, totalFixed: breakEvenBase });
// margen de la carta (espejo de catalogMargin)
const unidadesVar = new Map(); for (const s of septSales) for (const i of s.items ?? []) { const k = i.productId + ':' + (i.sizeId ?? ''); unidadesVar.set(k, (unidadesVar.get(k) ?? 0) + i.quantity); }
const catLines = [];
for (const p of products.filter((p) => p.is_active)) {
  if (!p.is_combo && (p.sizes ?? []).length) { for (const sz of p.sizes) catLines.push({ productId: p.id + ':' + sz.id, name: p.name + ' · ' + sz.name, price: N(p.base_price ?? 0) + N(sz.priceModifier), cost: costoHoy(p.id, sz.id), unitsSold: unidadesVar.get(p.id + ':' + sz.id) ?? 0 }); const sin = unidadesVar.get(p.id + ':') ?? 0; if (sin > 0) catLines.push({ productId: p.id, name: p.name, price: N(p.base_price ?? 0), cost: costoHoy(p.id, null), unitsSold: sin }); }
  else { let u = 0; for (const [k, v] of unidadesVar) if (k.startsWith(p.id + ':')) u += v; catLines.push({ productId: p.id, name: p.name, price: p.is_combo && p.combo_price !== null ? N(p.combo_price) : N(p.base_price ?? 0), cost: costoHoy(p.id, null), unitsSold: u }); }
}
const cat = D.computeCatalogMargin(catLines);
const target = D.breakEvenFromCatalogMargin(breakEvenBase, cat.marginPct);
const st = { ventas: septSales.length, revenue: r2(revenue), discount: r2(discount), cogs: r2(cogs), cogsPartial: unk > 0, cogsEstimated: est > 0, unkUnits: r4(unk), estUnits: r4(est), grossMargin: r2(grossMargin), grossMarginPct: r4(grossMargin / revenue), totalFixed, oneTime, cortesias: r2(cortCost), cortesiasPartial: cortUnk > 0, cortesiasEst: r2(cortEst), refund: r2(refundCost), waste: wasteCost, shrinkage: shrinkageCost, freight, freightInvoices: invSept.filter((i) => N(i.freight_amount) > 0).length, purchased: r2(invSept.reduce((a, i) => a + N(i.total) - N(i.freight_amount), 0)), payables: payablesPaid, delivery: r2(delivery), deliveryN, net, breakEvenBase, contributionMargin: r2(be.contributionMargin), contributionPct: be.contributionMarginPct === null ? null : r4(be.contributionMarginPct), breakEvenRealizado: be.breakEven === null ? null : r2(be.breakEven), catalogMarginPct: cat.marginPct === null ? null : r4(cat.marginPct), catalogTarget: target === null ? null : r2(target), catalogCoverage: target ? r4(revenue / target) : null, productsConsidered: cat.productsConsidered, productsWithoutCost: cat.productsWithoutCost, worst: cat.worst, best: cat.best };
console.log(JSON.stringify(st, null, 2));
ok(Math.abs((st.revenue - st.cogs) - st.grossMargin) < 0.01 && Math.abs(st.grossMargin - st.totalFixed - st.oneTime - st.cortesias - st.refund - st.waste - st.shrinkage - st.freight - st.payables - st.net) < 0.02, 'identidad del neto: margen bruto − fijos − únicos − cortesías − reembolsos − merma − faltantes − fletes − compromisos = neto');
ok(Math.abs(st.breakEvenBase - (st.totalFixed + st.oneTime + st.payables)) < 0.01, 'base del equilibrio = fijos recurrentes + únicos + compromisos');
if (st.breakEvenRealizado) ok(Math.abs(st.breakEvenRealizado * st.contributionPct - st.breakEvenBase) < st.breakEvenBase * 0.0002, 'equilibrio realizado × margen de contribución = base');
if (st.catalogTarget) ok(Math.abs(st.catalogTarget * st.catalogMarginPct - st.breakEvenBase) < st.breakEvenBase * 0.0002, 'meta de la carta × margen de la carta = base');
const cortAll = cortAppr.reduce((a, c) => a + N(c.cost_amount ?? 0), 0);
console.log(`  cortesías: costo guardado al crear (expanded-cost) Σ $${fmt(cortAll)} vs FIFO $${fmt(cortCost)} (${r4(cortUnk)} u sin costo, estimado $${fmt(cortEst)})`);

// ====================================================================
H('H. LOS TRES COSTOS DE CADA CORTESÍA — guardado al crear · FIFO real · "costo hoy" de la ficha');
for (const c of cortesias) {
  const p = prodById.get(c.product_id); const sz = c.size_id ? (p.sizes ?? []).find((x) => x.id === c.size_id)?.name : null;
  const e = full.cortesiaCostBySource.get(c.id); const hoy = costoHoy(c.product_id, c.size_id);
  // Los draws de una cortesía no están indexados por insumo: el desglose
  // insumo por insumo lo arma la sección H2, replayando hasta cada movimiento.
  console.log(`  ${c.created_at.slice(0, 16)} ${p.name}${sz ? ' · ' + sz : ''} × ${c.quantity} [${c.status}]: guardado $${fmt(N(c.cost_amount))} · FIFO $${fmt(e?.cost)}${e?.unknownQty ? ' (SIN costo ' + r4(e.unknownQty) + ' u)' : ''}${e?.estimatedCost ? ' (estimado $' + fmt(e.estimatedCost) + ')' : ''} · hoy $${fmt(hoy !== null ? hoy * c.quantity : null)} · precio $${fmt(N(c.sale_price))}`);
}

// ====================================================================
H('I. COSTO POR PRODUCTO — "costo hoy" (último precio) vs "costo real" (FIFO 30 días, como /reports/cogs/product-margins)');
const now = CUTOFF ?? new Date(); const from30 = new Date(now.getTime() - 30 * 86400000);
const sales30 = sales.filter((s) => s.paid_at && utc(s.paid_at) >= from30 && utc(s.paid_at) <= now && !NONREV.has(s.status));
const acc = new Map();
const unitOf = (m, id) => { const e = m?.get(id); if (!e) return 0; const known = e.qty - e.unknownQty; return known > 0 ? e.cost / known : 0; };
for (const s of sales30) {
  const ing = full.saleIngredientCost.get(s.id), pr = full.saleProductCost.get(s.id), sb = full.saleSubproductCost.get(s.id);
  const od = N(s.order_discount_amount) ?? 0; const lineSum = (s.items ?? []).reduce((a, i) => a + N(i.lineTotal), 0); const f = od > 0 && lineSum > 0 ? od / lineSum : 0;
  for (const it of s.items ?? []) {
    const a = acc.get(it.productId) ?? { units: 0, revenue: 0, cogs: 0, partial: false, unkUnitsHoy: 0, estUnits: 0, hoy: 0 }; acc.set(it.productId, a);
    a.units += it.quantity; a.revenue += N(it.lineTotal) * (1 - f);
    const exp = expectedConsumption([it]);
    for (const [k, q] of exp) {
      const [tp, id] = k.split(':'); const m = tp === 'INGREDIENT' ? ing : tp === 'PRODUCT' ? pr : sb; const e = m?.get(id);
      a.cogs += q * unitOf(m, id);
      if ((e?.unknownQty ?? 0) > 0) { a.partial = true; /* porción sin costo de esta línea, valorada a costo de hoy */ const share = q * (e.unknownQty / e.qty); const hoyU = tp === 'INGREDIENT' ? ingCostHoy.get(id) : tp === 'PRODUCT' ? fallback['PRODUCT:' + id] : null; if (hoyU) a.unkUnitsHoy += share * hoyU; }
      if ((e?.estimatedQty ?? 0) > 0) a.estUnits += q * (e.estimatedQty / e.qty);
    }
    const h = costoHoy(it.productId, it.sizeId); if (h !== null) a.hoy += h * it.quantity;
  }
}
console.log('  producto'.padEnd(26) + 'precio'.padStart(9) + 'hoy/u base'.padStart(12) + 'hoy/u vendido'.padStart(15) + 'real/u'.padStart(10) + '⚠'.padStart(3) + 'real+sin-costo@hoy'.padStart(20) + 'dif%'.padStart(7) + '  variantes hoy');
for (const [pid, a] of [...acc].sort((x, y) => y[1].revenue - x[1].revenue)) {
  const p = prodById.get(pid); if (!p) continue; const baseHoy = costoHoy(pid, null); const price = p.is_combo && p.combo_price !== null ? N(p.combo_price) : N(p.base_price);
  const realU = a.cogs / a.units, hoyVendidoU = a.hoy / a.units, corr = (a.cogs + a.unkUnitsHoy) / a.units;
  const vars = (p.sizes ?? []).map((sz) => `${sz.name} $${fmt(costoHoy(pid, sz.id))}`).join(', ');
  console.log(`  ${p.name.padEnd(26)}${fmt(price).padStart(9)}${fmt(baseHoy).padStart(12)}${fmt(hoyVendidoU).padStart(15)}${fmt(realU).padStart(10)}${(a.partial ? '⚠' : '').padStart(3)}${fmt(corr).padStart(20)}${(((corr - hoyVendidoU) / hoyVendidoU) * 100).toFixed(1).padStart(7)}  ${vars}`);
}
console.log('\n  Lectura: "hoy/u base" es lo que la tabla muestra como Costo hoy (receta base, sin variante); "hoy/u vendido" pondera por las variantes que de verdad se vendieron;');
console.log('  "real/u" es el FIFO de la tabla (⚠ = parte del consumo salió de lotes SIN costo y NO suma); "real+sin-costo@hoy" completa esa parte al costo de hoy.');

// ====================================================================
H('J. SUBPRODUCTOS — costo de la receta hoy vs costo FIFO de los lotes producidos (explica la diferencia hoy↔real en los preparados)');
for (const s of subproducts.filter((s) => s.is_active)) {
  const rec = D.expandRecipe(baseGraph, { kind: 'subproduct', id: s.id }); let c = 0, miss = false; for (const e of rec.values()) { const u = ingCostHoy.get(e.ingredientId); if (u === null || u === undefined) miss = true; else c += e.totalQuantity * u; }
  const perUnitHoy = miss ? null : c / N(s.yield);
  const lots = full.remainingLots.get('SUBPRODUCT:' + s.id) ?? []; const lastLot = lots.length ? lots[lots.length - 1] : null;
  const runsOf = [...runs.values()].filter((rows) => rows.some((r) => r.delta > 0 && r.subproductId === s.id)).length;
  console.log(`  ${s.name.padEnd(22)} receta hoy $${(perUnitHoy === null ? '—' : perUnitHoy.toFixed(2)).padStart(9)}/u · último lote FIFO $${(lastLot ? (lastLot.unitCost === null ? 'null' : lastLot.unitCost.toFixed(2)) : '—').padStart(9)}/u · ${runsOf} tandas · stock ${r4(sumDelta.get('SUBPRODUCT:' + s.id) ?? 0)}`);
}

// ====================================================================
H('H2. CORTESÍAS — de dónde sale la diferencia guardado ↔ FIFO ↔ hoy, insumo por insumo');
const ledgerHasta = (t, incl) => D.runLedgerFifo(movs.filter((m) => (incl ? m.createdAt <= t : m.createdAt < t)), undefined, { fallbackUnitCost: fallback });
const hoyU = (k) => { const [tp, id] = k.split(':'); if (tp === 'INGREDIENT') return ingCostHoy.get(id) ?? null; if (tp === 'PRODUCT') return fallback[k] ?? null; const s = subById.get(id); const rec = D.expandRecipe(baseGraph, { kind: 'subproduct', id }); let c = 0; for (const e of rec.values()) { const u = ingCostHoy.get(e.ingredientId); if (u === null || u === undefined) return null; c += e.totalQuantity * u; } return c / N(s.yield); };
for (const c of cortesias.filter((c) => c.status === 'APPROVED')) {
  const rows = movsBySource.get('cortesia|' + c.id) ?? []; if (!rows.length) continue;
  const t0 = rows[0].createdAt; const before = ledgerHasta(t0, false), after = ledgerHasta(rows[rows.length - 1].createdAt, true);
  const p = prodById.get(c.product_id); const sz = c.size_id ? (p.sizes ?? []).find((x) => x.id === c.size_id)?.name : null;
  console.log(`  ${p.name}${sz ? ' · ' + sz : ''} × ${c.quantity} (${c.created_at.slice(0, 10)})`);
  let tf = 0, th = 0; const det = [];
  for (const m of rows) { const k = keyOf(m); const q = -m.delta; const rb = before.remaining.get(k) ?? { value: 0, qty: 0, unknownQty: 0 }, ra = after.remaining.get(k) ?? { value: 0, qty: 0, unknownQty: 0 }; const fifo = rb.value - ra.value; const unk = ra.unknownQty < rb.unknownQty ? rb.unknownQty - ra.unknownQty : 0; const h = hoyU(k); const hoy = h === null ? null : q * h; tf += fifo; th += hoy ?? 0; if (hoy !== null && Math.abs(fifo - hoy) > 150) det.push(`     ${nm(k).padEnd(24)} ${String(q).padStart(8)} u · FIFO ${fmt(fifo).padStart(7)} (${unk ? 'sin costo ' + r4(unk) + ' u · ' : ''}${fifo > 0 ? (fifo / (q - unk)).toFixed(2) : '—'}/u) · hoy ${fmt(hoy).padStart(7)} (${h.toFixed(2)}/u) → ${fmt(fifo - hoy)}`); }
  console.log(`     Σ FIFO ${fmt(tf)} · Σ hoy ${fmt(th)} · guardado al crear ${fmt(N(c.cost_amount))}; insumos que explican la diferencia (> $150):`); for (const l of det) console.log(l);
}

H('I2. PRODUCTOS — insumo por insumo, FIFO de lo vendido (30 días) vs costo de hoy: qué explica cada "costo real"');
const spotlight = ['Mac & Cheese', 'Burros', 'Tenders', 'Sandiwch TERCOS', 'Double smash', 'Papas TERCOS', 'Burro con costra', 'Combo 1'];
for (const name of spotlight) {
  const p = products.find((x) => x.name === name); if (!p) continue;
  const perKey = new Map();
  for (const s of sales30) for (const it of s.items ?? []) { if (it.productId !== p.id) continue; const exp = expectedConsumption([it]); for (const [k, q] of exp) { const [tp, id] = k.split(':'); const m = tp === 'INGREDIENT' ? full.saleIngredientCost.get(s.id) : tp === 'PRODUCT' ? full.saleProductCost.get(s.id) : full.saleSubproductCost.get(s.id); const e = m?.get(id); const a = perKey.get(k) ?? { q: 0, fifo: 0, unk: 0, hoy: 0 }; a.q += q; if (e) { const known = e.qty - e.unknownQty; a.fifo += known > 0 ? q * (e.cost / known) * (known / e.qty) : 0; a.unk += q * (e.unknownQty / e.qty); } const h = hoyU(k); if (h !== null) a.hoy += q * h; perKey.set(k, a); } }
  const units = acc.get(p.id)?.units ?? 0; if (!units) continue;
  const tot = [...perKey.values()].reduce((a, v) => ({ fifo: a.fifo + v.fifo, hoy: a.hoy + v.hoy }), { fifo: 0, hoy: 0 });
  console.log(`  ${name}: ${units} u vendidas · FIFO ${fmt(tot.fifo / units)}/u vs hoy ${fmt(tot.hoy / units)}/u. Insumos que más separan los dos (por unidad vendida):`);
  const rows = [...perKey.entries()].map(([k, v]) => ({ k, ...v, diff: (v.fifo - v.hoy) / units })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 5);
  for (const r of rows) console.log(`     ${nm(r.k).padEnd(24)} ${r4(r.q / units).toString().padStart(9)} u/venta · FIFO ${(r.fifo / Math.max(r.q - r.unk, 1e-9)).toFixed(2).padStart(8)}/u${r.unk ? ' (sin costo ' + r4(r.unk / units) + ' u/venta)' : ''} · hoy ${((hoyU(r.k) ?? 0)).toFixed(2).padStart(8)}/u → ${fmt(r.diff).padStart(7)} $/u vendida`);
}

H('K. HORA DEL CONSUMO — el descuento de stock ocurre al cobrar');
let lateBad = 0; for (const s of sales.filter((s) => s.status === 'PAGADO')) { const rows = movsBySource.get('sale|' + s.id) ?? []; const pa = utc(s.paid_at); for (const m of rows) if (m.delta < 0 && Math.abs(m.createdAt - pa) > 5000) { lateBad++; if (lateBad <= 3) console.log(`     #${s.receipt_number} cobro ${s.paid_at} movimiento ${m.createdAt.toISOString()} (${nm(keyOf(m))})`); } }
console.log(`  movimientos de venta fuera de ±5 s del cobro: ${lateBad} (ediciones posteriores del pedido explican los que haya)`);

H('RESUMEN');
console.log(`${checks} comprobaciones, ${fails.length} fallidas`);
for (const f of fails) console.log('  ✗ ' + f);
