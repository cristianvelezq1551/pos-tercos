/**
 * Prompt único usado por todos los adapters LLM para extraer facturas
 * colombianas. Centralizado acá (en domain) porque la lógica del prompt
 * NO depende del proveedor concreto.
 */
export const INVOICE_EXTRACTION_SYSTEM = `Eres un experto en extraer datos estructurados de facturas colombianas de proveedores de comida (insumos para restaurante).

Tu salida DEBE ser SOLO un objeto JSON válido (sin markdown, sin texto adicional, sin tripe-backticks). Si alguna información no es legible o no está presente, usa null. Usa warnings para señalar baja confianza.

Schema de salida (estricto):
{
  "supplierName": string | null,
  "supplierNit": string | null,
  "invoiceNumber": string | null,
  "total": number | null,
  "iva": number | null,
  "freight": number | null,
  "items": [
    {
      "descriptionRaw": string,
      "quantity": number,
      "unit": string,
      "unitPrice": number,
      "total": number,
      "packUnits": number | null,
      "packSizePerUnit": number | null,
      "packSizeMeasure": string | null
    }
  ],
  "warnings": string[]
}

Reglas:
- Los montos van en COP sin separadores: 18000, no "18.000" ni "$18,000".
- Si una factura tiene NIT con dígito de verificación tipo "900.123.456-7", devuelve el string completo en supplierNit.
- Cada item DEBE tener: descripción tal como aparece, cantidad numérica > 0, unidad ("kg","lt","unidad","caja","docena","g","ml"), precio unitario sin formato, y total = quantity * unitPrice (verifica que coincida; si difiere, agrega un warning).
- DESGLOSE DE EMPAQUE: muchas líneas describen el contenido del empaque, ej. "FILETE 150 g X 10 U" = cada unidad de compra trae 10 sub-unidades de 150 g; "CAJA X 24", "BULTO 25 KG", "x12 und". Cuando la descripción lo indique, completa:
    · packUnits = sub-unidades por unidad de compra (10 en "X 10 U", 24 en "CAJA X 24", 12 en "x12"). Si no hay cantidad de sub-unidades, null.
    · packSizePerUnit = tamaño de cada sub-unidad (150 en "150 g", 25 en "25 KG"). Si no aplica, null.
    · packSizeMeasure = la medida de esa sub-unidad ("g","ml","kg","und"). Si no aplica, null.
  IMPORTANTE: \`quantity\` SIGUE siendo el número de unidades de COMPRA de la línea (los paquetes/cajas), NO las sub-unidades. El empaque va aparte en estos 3 campos. Si la línea no tiene info de empaque, deja los 3 en null.
- DOMICILIO / FLETE: si la factura cobra por traer la mercancía (una línea que diga "domicilio", "envío", "flete", "transporte", "acarreo", "despacho" o similar), su valor va en el campo \`freight\` del nivel raíz y esa línea NO se incluye en \`items\`. Un flete no es un insumo: no se almacena ni se cocina. Si la factura no cobra flete, \`freight\` es null (no 0 — null significa "no lo trae").
- \`total\` es el total de la factura e INCLUYE el flete si lo hay. O sea: total ≈ suma de los totales de items + freight.
- Si la factura tiene productos repetidos en distintas líneas, mantén las líneas separadas (no combines).
- Si NO puedes leer un valor numérico crítico, deja el campo como null y agrega una entrada en warnings.
- NO inventes datos. Es preferible warnings y nulls que data falsa.
- Los warnings los lee el DUEÑO del negocio en su pantalla: escríbelos en español
  neutro con tuteo, en una frase, diciendo qué revisar. Nada de inglés ni de
  nombres de campos del sistema («Line 11: calculated total differs» está MAL;
  «Revisa el total de la línea 11: la cuenta no da» está bien).`;

export const INVOICE_EXTRACTION_USER = `Esta es la foto de una factura. Devuelve el JSON estructurado según el schema indicado.`;

/**
 * Normaliza los items crudos del LLM antes del Zod parse: garantiza que cada
 * item tenga las claves de empaque (packUnits/packSizePerUnit/packSizeMeasure)
 * y la conversión elegida (baseFactor) en null si no venían. Los valores
 * presentes ganan sobre el default.
 */
export function normalizeExtractedItems(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((it) =>
    it && typeof it === 'object'
      ? {
          packUnits: null,
          packSizePerUnit: null,
          packSizeMeasure: null,
          // `baseFactor` no lo devuelve el LLM: lo elige la persona al revisar
          // y se guarda al dejar la factura en borrador.
          baseFactor: null,
          ...(it as object),
        }
      : it,
  );
}

/**
 * Rellena los campos que el LLM omite del JSON antes del Zod parse: `items` y
 * `warnings` como arrays vacíos, `freight` en null, y las claves de empaque de
 * cada ítem. Los valores presentes SIEMPRE ganan sobre el default.
 *
 * Vive acá (y no en cada adapter) porque Anthropic y OpenAI tenían la misma
 * lista de defaults copiada: agregar un campo obligaba a acordarse de los dos,
 * y el que se olvidara fallaba recién en el Zod parse, en producción.
 */
export function normalizeExtractedInvoice(parsed: Record<string, unknown>): Record<string, unknown> {
  const out = { ...parsed };
  if (out.items === undefined || out.items === null) out.items = [];
  if (out.warnings === undefined || out.warnings === null) out.warnings = [];
  if (out.freight === undefined) out.freight = null;
  out.items = normalizeExtractedItems(out.items);
  return out;
}

// ====================================================================
// Purchase suggestion evaluation (FASE 12.D)
// ====================================================================

export const PURCHASE_SUGGESTION_SYSTEM = `Eres un asistente del dueño de un restaurante de comida rápida en Bogotá, Colombia.

Tu trabajo es evaluar sugerencias de compra de insumos/productos generadas automáticamente por el sistema cuando las existencias caen por debajo del mínimo definido por el dueño.

Recibes:
- Item (nombre + unidad de compra)
- Existencias actuales + mínimo, ambos en unidad de inventario
- Cantidad sugerida + costo estimado total
- Histórico de las últimas compras del item (fecha, proveedor, cantidad, $/unidad)

Cómo se calcula la cantidad sugerida: cubre EXACTAMENTE lo que falta para
volver al mínimo, redondeado hacia arriba a unidades de compra enteras (no se
compran medios paquetes). O sea que deja las existencias justo en el mínimo o
un poco encima — nunca con holgura grande. Tenlo en cuenta al opinar: si el
consumo del item es alto, quedarse en el mínimo puede ser poco.

Devuelve un análisis CORTO y práctico en español (máximo 3 frases, ~50 palabras) que cubra (lo que sea relevante):
- Si la cantidad sugerida es razonable o conviene ajustar (ej. comprar más por descuento por volumen, o menos para no acumular).
- Si el costo se ve consistente con el histórico, o si hay un proveedor más barato en los registros.
- Si conviene comprar YA o esperar (ej. consumo bajo y mínimo pequeño).
- Si detectas algo raro (precios subiendo mucho, proveedor único, etc.).

Reglas:
- Tono directo y cercano, sin formalidad. Como un mentor que conoce el negocio.
- Español neutro (no uses voseo: nunca "tenés", "podés", "revisá"; usa "tienes", "puedes", "revisa").
- NO inventes proveedores ni precios que no estén en el histórico.
- Si el histórico está vacío, dilo y limítate a comentar la cantidad y el mínimo.
- Responder SOLO con el texto del análisis. No JSON, no markdown, sin headers.
- Sin saludos, sin "espero que sea útil", sin disclaimers. Solo el análisis.
- Escribe para el dueño, no para un técnico: nada de palabras en inglés
  ("threshold", "stock out", "timing") ni nombres de campos del sistema. Di
  "el mínimo", "las existencias", "se puede acabar".`;

export function buildPurchaseSuggestionUserPrompt(input: {
  itemName: string;
  unitPurchase: string;
  currentStock: number;
  thresholdMin: number;
  unitStock: string;
  suggestedQty: number;
  estUnitCost: number | null;
  estTotal: number | null;
  history: Array<{
    date: string;
    supplierName: string;
    qty: number;
    unit: string;
    unitPrice: number;
  }>;
}): string {
  const lines: string[] = [
    `Item: ${input.itemName}`,
    `Existencias actuales: ${input.currentStock} ${input.unitStock} | Mínimo: ${input.thresholdMin} ${input.unitStock}`,
    `Sugerencia: comprar ${input.suggestedQty} ${input.unitPurchase}` +
      (input.estUnitCost !== null && input.estTotal !== null
        ? ` a ~$${formatNumber(input.estUnitCost)}/${input.unitPurchase} (total ~$${formatNumber(input.estTotal)})`
        : ' (sin costo histórico)'),
    '',
    'Historial de compras:',
  ];
  if (input.history.length === 0) {
    lines.push('  (sin compras registradas)');
  } else {
    for (const h of input.history) {
      lines.push(
        `  ${h.date} · ${h.supplierName} · ${h.qty} ${h.unit} a $${formatNumber(h.unitPrice)}/${h.unit}`,
      );
    }
  }
  lines.push('', 'Evalúa esta sugerencia.');
  return lines.join('\n');
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('es-CO');
}

// ====================================================================
// Asistente de cierre de caja (FASE IA — explica el descuadre)
// ====================================================================

export const SHIFT_CLOSE_SYSTEM = `Eres el asistente de caja de un restaurante de comida rápida en Colombia. Te dan el resumen del cierre de una caja y explicas, en español claro y directo, cómo quedó y por qué pudo darse la diferencia (sobrante/faltante).

Reglas:
- Máximo 3 frases cortas. Tono profesional, sin alarmar de más.
- Si la diferencia es 0 o menor a $1.000, di que la caja cuadró bien.
- Si hay faltante, menciona causas probables según los datos (vueltos mal dados, ventas en efectivo, salidas de efectivo sin registrar, anulaciones). Si hay sobrante, lo mismo al revés.
- No inventes datos que no estén. No des cifras nuevas; refiérete a las que te dan.
- Español neutro (no uses voseo: nunca "tenés", "podés", "revisá"; usa "tienes", "puedes", "revisa").`;

export interface ShiftCloseAnalysisInput {
  openingCash: number;
  cashSalesTotal: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number;
  difference: number; // counted - expected
  voidCount: number;
  noSaleDrawerCount: number;
}

export function buildShiftCloseUserPrompt(i: ShiftCloseAnalysisInput): string {
  const cop = (n: number) => `$${formatNumber(n)}`;
  const signo = i.difference > 0 ? 'sobrante' : i.difference < 0 ? 'faltante' : 'exacto';
  return [
    'Cierre de caja:',
    `- Apertura (efectivo inicial): ${cop(i.openingCash)}`,
    `- Ventas en efectivo: ${cop(i.cashSalesTotal)}`,
    `- Entradas de efectivo (movimientos): ${cop(i.cashIn)}`,
    `- Salidas de efectivo (movimientos): ${cop(i.cashOut)}`,
    `- Esperado en caja: ${cop(i.expectedCash)}`,
    `- Contado físicamente: ${cop(i.countedCash)}`,
    `- Diferencia: ${cop(i.difference)} (${signo})`,
    `- Ventas anuladas en el turno: ${i.voidCount}`,
    `- Aperturas de cajón sin venta: ${i.noSaleDrawerCount}`,
    '',
    'Explica cómo quedó la caja y la causa probable de la diferencia.',
  ].join('\n');
}

// ====================================================================
// Resumen diario para el dueño (FASE IA — lenguaje natural)
// ====================================================================

export const DAILY_SUMMARY_SYSTEM = `Eres el analista de operación de un restaurante de comida rápida en Colombia. Te dan métricas del día y escribes un resumen ejecutivo para el dueño, en español, claro y accionable.

Reglas:
- Máximo 5 frases. Empieza por lo más importante (ventas del día).
- Resalta lo bueno y lo que requiere atención (descuadres, anulaciones, stock bajo).
- Cierra con UNA sugerencia concreta si los datos la justifican.
- No inventes datos. Usa solo lo que te dan.
- Español neutro (no uses voseo: nunca "tenés", "podés", "revisá"; usa "tienes", "puedes", "revisa").`;

export interface DailySummaryInput {
  date: string; // YYYY-MM-DD
  revenue: number;
  orderCount: number;
  avgTicket: number;
  cashRevenue: number;
  digitalRevenue: number;
  voidCount: number;
  cashDifference: number | null; // del cierre del día, si lo hubo
  lowStockCount: number;
  topProducts: Array<{ name: string; qty: number }>;
}

export function buildDailySummaryUserPrompt(i: DailySummaryInput): string {
  const cop = (n: number) => `$${formatNumber(n)}`;
  const lines = [
    `Día: ${i.date}`,
    `- Ventas: ${cop(i.revenue)} en ${i.orderCount} pedidos (ticket promedio ${cop(i.avgTicket)})`,
    `- Efectivo: ${cop(i.cashRevenue)} | Digital: ${cop(i.digitalRevenue)}`,
    `- Anulaciones: ${i.voidCount}`,
    `- Diferencia de caja al cierre: ${i.cashDifference === null ? 'sin cierre' : cop(i.cashDifference)}`,
    `- Insumos/productos con stock bajo: ${i.lowStockCount}`,
  ];
  if (i.topProducts.length > 0) {
    lines.push(
      `- Más vendidos: ${i.topProducts.map((p) => `${p.name} (${p.qty})`).join(', ')}`,
    );
  }
  lines.push('', 'Escribe el resumen del día para el dueño.');
  return lines.join('\n');
}

// ====================================================================
// FINANCIAL STATEMENT ANALYSIS — IA lee el estado financiero del mes
// ====================================================================

export const FINANCIAL_ANALYSIS_SYSTEM = `Eres el analista financiero del dueño de un restaurante de comida rápida en Colombia. Te dan el estado financiero del mes TAL COMO LO VE EL DUEÑO EN PANTALLA, más la tendencia de los meses anteriores, y devuelves un análisis breve y accionable en español.

CÓMO LEER EL ESTADO (son las mismas líneas que muestra la pantalla):
- "Ingresos" ya vienen netos de descuentos y SIN el cobro de domicilios: esa plata es del repartidor y solo pasa por la caja. Nunca la cuentes como venta ni como ingreso.
- "COGS" es el costo real de lo vendido, lote por lote (FIFO). "Margen bruto" = ingresos − COGS. Si el COGS viene marcado "estimado" o "parcial", el margen es provisional y lo dices con esa palabra.
- Los costos fijos son RECURRENTES (nómina, arriendo, servicios) y son la base del punto de equilibrio. Una línea marcada "estimado" es el monto configurado porque ese mes todavía no tiene pago registrado: menciónala como estimado, nunca como dato cerrado.
- Las "otras pérdidas" van debajo del margen bruto y NO entran al COGS: merma (alguien la declaró), faltantes (lo que apareció de menos al contar; nadie lo declaró), cortesías, reembolsos, fletes de compra, compromisos pagados y gastos únicos. Los gastos únicos y los compromisos pagados SÍ entran a la base del equilibrio: también hay que pagarlos con las ventas del mes.
- "Margen de contribución" = ingresos − COGS − merma − faltantes − cortesías − reembolsos − fletes: lo que queda de cada venta para pagar lo fijo.
- Hay DOS puntos de equilibrio y el dueño ve el de la CARTA: las ventas necesarias calculadas con lo que deja cada producto por precio y receta, que no se mueve por lo bueno o lo malo que haya estado el mes. El "realizado" usa el margen de contribución del mes: sirve solo para explicar la brecha entre lo que la carta promete y lo que de verdad quedó (merma, cortesías, faltantes, fletes).
- Si el mes tiene pocas ventas, dilo antes de sacar conclusiones de porcentajes: cuatro tickets y una merma no son una tendencia.

REGLAS DURAS:
- Responde EXCLUSIVAMENTE con un JSON válido con esta forma exacta:
  {"tono":"saludable|atencion|critico","titular":"...","bullets":[{"tipo":"positivo|vigilar|accion","texto":"..."}],"siguiente_paso":"..."}
- "tono" se decide con la cobertura del equilibrio DE LA CARTA, que es la que ve el dueño: "saludable" si el neto es positivo y esa cobertura es >= 100%; "atencion" si la cobertura está entre 80% y 99%; "critico" si está debajo de 80% o el neto es negativo. Si no viene equilibrio de la carta, usa el realizado; si no viene ninguno, decide solo por el signo del neto.
- "titular": UNA frase. Empieza con el resultado: cuánto ganó/perdió, contra el equilibrio de la carta. Incluye una cifra concreta en pesos.
- "bullets": 3 a 5 puntos. Mix de positivos (qué va bien), vigilar (riesgos numéricos) y acción (qué hacer concreto). Cada bullet UNA frase, con número o porcentaje cuando aplique.
- "siguiente_paso": UNA acción concreta para el próximo mes, basada solo en los datos. No moralices ni filosofes.
- NO inventes datos. NO menciones cifras que no estén en el input. Una cifra marcada "estimado" o "parcial" se cita como provisional.
- Español neutro (no uses voseo: nunca "tenés", "podés", "revisá"; usa "tienes", "puedes", "revisa"). Tono directo, sin jerga financiera complicada.`;

/**
 * Lo que recibe el modelo. Es un ESPEJO de `MonthlyFinancialStatement`, la
 * misma línea por línea que pinta la tarjeta del P&G, el equilibrio y las
 * tarjetas de domicilios: si la pantalla muestra un número, el modelo lo
 * recibe con el mismo rótulo y la misma marca de estimado. Antes veía
 * `ingresos − COGS − fijos` y un neto que no se deducía de eso, y opinaba
 * sobre un equilibrio (el realizado) distinto del que el dueño tiene en
 * pantalla (el de la carta).
 */
export interface FinancialAnalysisInput {
  year: number;
  month: number; // 1-12
  monthLabel: string; // "mayo 2026"
  /** Ventas cobradas en el mes: contexto para no leer porcentajes de 4 tickets. */
  salesCount: number;
  /** Lo que habría entrado sin descuentos (solo se muestra si hubo descuentos). */
  grossRevenue: number;
  /** Descuentos y promociones otorgados, ya restados de `revenue`. */
  discountTotal: number;
  /** Ingresos netos de descuentos y SIN el cobro de domicilios. */
  revenue: number;
  cogs: number;
  /** Parte del COGS salió del último precio conocido (venta sin stock). */
  cogsEstimated: boolean;
  /** Parte del COGS no tiene costo (sin lote ni precio): está SUBESTIMADO. */
  cogsPartial: boolean;
  grossMargin: number;
  grossMarginPct: number; // 0..1
  totalFixed: number;
  fixedCosts: ReadonlyArray<{
    name: string;
    category: string;
    monthlyAmount: number;
    isPayroll: boolean;
    /** Sin pago registrado: el monto es el configurado, no el real del mes. */
    isEstimated: boolean;
  }>;
  /**
   * Pérdidas que van DEBAJO del margen bruto y explican el salto hasta el neto:
   * merma, faltantes, cortesías, reembolsos, fletes de compra, compromisos
   * pagados y gastos únicos. Se pasan solo las que tienen monto; `estimated`
   * marca las que la pantalla rotula como provisionales.
   */
  otherLosses: ReadonlyArray<{ label: string; amount: number; estimated?: boolean }>;
  netResult: number;
  /** Lo que el mes tiene que cubrir: fijos + gastos únicos + compromisos pagados. */
  breakEvenBase: number;
  /** Ingresos − COGS − merma − faltantes − cortesías − reembolsos − fletes. */
  contributionMargin: number;
  contributionMarginPct: number | null;
  /** Equilibrio REALIZADO (margen de contribución del mes). */
  breakEven: number | null;
  breakEvenCoverage: number | null; // 0..1+
  /** Equilibrio DE LA CARTA: el que la pantalla muestra como meta. */
  catalogBreakEven: {
    target: number | null;
    marginPct: number | null;
    coverage: number | null;
    weightedBySales: boolean;
    productsConsidered: number;
    productsWithoutCost: number;
    best: { name: string; marginPct: number } | null;
    worst: { name: string; marginPct: number } | null;
  };
  /** Domicilios cobrados a clientes: NO es ingreso, es plata del repartidor. */
  deliveryCollected: number;
  deliveryOrderCount: number;
  /** Últimos meses (incluido el actual al final), 3-6 puntos. */
  trend: ReadonlyArray<{
    monthLabel: string;
    revenue: number;
    cogs: number;
    totalFixed: number;
    netResult: number;
  }>;
}

export function buildFinancialAnalysisUserPrompt(i: FinancialAnalysisInput): string {
  const cop = (n: number) => `$${formatNumber(n)}`;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines: string[] = [
    `Estado financiero del mes (${i.monthLabel}) — ${i.salesCount} ventas cobradas:`,
    ...incomeAndCogsLines(i, cop, pct),
    `- Costos fijos recurrentes: ${cop(i.totalFixed)}`,
    ...fixedCostLines(i.fixedCosts, cop),
    ...lossLines(i.otherLosses, cop),
    `- Resultado neto: ${cop(i.netResult)}`,
    i.contributionMarginPct === null
      ? `- Margen de contribución: ${cop(i.contributionMargin)} (sin ingresos, no hay porcentaje)`
      : `- Margen de contribución: ${cop(i.contributionMargin)} (${pct(i.contributionMarginPct)})`,
    `- Base del equilibrio (fijos + gastos únicos + compromisos pagados del mes): ${cop(i.breakEvenBase)}`,
    ...catalogBreakEvenLines(i.catalogBreakEven, cop, pct),
    realizedBreakEvenLine(i, cop, pct),
  ];
  if (i.deliveryOrderCount > 0) {
    lines.push(
      `- Domicilios cobrados a clientes: ${cop(i.deliveryCollected)} en ${i.deliveryOrderCount} pedidos (NO es ingreso: es plata del repartidor, no está en ninguna cifra de arriba)`,
    );
  }
  if (i.trend.length > 1) {
    lines.push('', 'Tendencia de los últimos meses (más viejo → más nuevo):');
    for (const t of i.trend) {
      lines.push(
        `- ${t.monthLabel}: ingresos ${cop(t.revenue)} · cogs ${cop(t.cogs)} · fijos ${cop(t.totalFixed)} · neto ${cop(t.netResult)}`,
      );
    }
  }
  lines.push('', 'Devuelve el análisis en JSON según las reglas.');
  return lines.join('\n');
}

type Cop = (n: number) => string;
type Pct = (x: number) => string;

/** Ingresos (con descuentos solo si los hubo), COGS con su marca y margen bruto. */
function incomeAndCogsLines(i: FinancialAnalysisInput, cop: Cop, pct: Pct): string[] {
  const out: string[] = [];
  if (i.discountTotal > 0) {
    out.push(
      `- Ventas a precio de lista: ${cop(i.grossRevenue)}`,
      `- Descuentos y promociones (ya restados): ${cop(i.discountTotal)}`,
    );
  }
  const cogsTag = i.cogsPartial
    ? ' [parcial: parte de lo vendido no tiene costo cargado → el COGS está SUBESTIMADO y la ganancia sobreestimada]'
    : i.cogsEstimated
      ? ' [estimado en parte: ventas sin stock costeadas al último precio; se corrige al subir la factura]'
      : '';
  out.push(
    `- Ingresos del mes (netos de descuentos, sin domicilios): ${cop(i.revenue)}`,
    `- COGS (costo real FIFO de lo vendido): ${cop(i.cogs)}${cogsTag}`,
    `- Margen bruto: ${cop(i.grossMargin)} (${pct(i.grossMarginPct)})`,
  );
  return out;
}

function fixedCostLines(costs: FinancialAnalysisInput['fixedCosts'], cop: Cop): string[] {
  if (costs.length === 0) return [];
  const out = ['  Desglose de costos fijos:'];
  for (const c of costs) {
    const tag = c.isPayroll
      ? ' [auto desde Nómina]'
      : c.isEstimated
        ? ' [estimado: todavía sin pago registrado este mes]'
        : '';
    out.push(`    · ${c.name} (${c.category}): ${cop(c.monthlyAmount)}${tag}`);
  }
  return out;
}

function lossLines(losses: FinancialAnalysisInput['otherLosses'], cop: Cop): string[] {
  const perdidas = losses.filter((l) => l.amount > 0);
  if (perdidas.length === 0) return [];
  const out = ['- Otras pérdidas del mes (no entran al COGS):'];
  for (const l of perdidas) {
    out.push(`    · ${l.label}: ${cop(l.amount)}${l.estimated ? ' [estimado]' : ''}`);
  }
  return out;
}

function realizedBreakEvenLine(i: FinancialAnalysisInput, cop: Cop, pct: Pct): string {
  if (i.breakEven === null) {
    return '- Punto de equilibrio REALIZADO: no existe este mes (el margen de contribución no es positivo: cada venta pierde plata)';
  }
  const cob = i.breakEvenCoverage === null ? '' : ` · cobertura ${pct(Math.min(i.breakEvenCoverage, 2))}`;
  return `- Punto de equilibrio REALIZADO (con la merma, cortesías, faltantes y fletes del mes): ${cop(i.breakEven)}${cob}`;
}

/** El bloque del equilibrio tal como lo ve el dueño: meta, cobertura y de dónde sale. */
function catalogBreakEvenLines(
  c: FinancialAnalysisInput['catalogBreakEven'],
  cop: Cop,
  pct: Pct,
): string[] {
  if (c.marginPct !== null && c.marginPct <= 0) {
    return [
      '- Punto de equilibrio DE LA CARTA (el que ve el dueño): no existe: con los precios y recetas de hoy los productos no dejan ganancia; vender más no acerca a cubrir lo fijo',
    ];
  }
  if (c.target === null) {
    return [
      '- Punto de equilibrio DE LA CARTA (el que ve el dueño): todavía no se puede calcular (ningún producto tiene costo de receta)',
    ];
  }
  const partes = [
    `ventas necesarias ${cop(c.target)}`,
    c.coverage === null ? 'sin costos fijos que cubrir' : `cobertura ${pct(Math.min(c.coverage, 2))}`,
    c.marginPct === null ? '' : `de cada $100 vendidos quedan $${Math.round(c.marginPct * 100)}`,
    `${c.productsConsidered} opciones de la carta ${c.weightedBySales ? 'ponderadas por lo vendido' : 'a promedio simple (aún sin ventas)'}`,
  ].filter((p) => p.length > 0);
  const out = [`- Punto de equilibrio DE LA CARTA (el que ve el dueño): ${partes.join(' · ')}`];
  if (c.productsWithoutCost > 0) {
    out.push(`    · ${c.productsWithoutCost} opciones quedaron fuera del promedio porque no se sabe cuánto cuestan`);
  }
  if (c.best && c.worst && c.productsConsidered > 1) {
    out.push(`    · el que más deja: ${c.best.name} (${pct(c.best.marginPct)}); el que menos: ${c.worst.name} (${pct(c.worst.marginPct)})`);
  }
  return out;
}

// ====================================================================
// Revisión de una lista de faltantes (2026-08-26)
// ====================================================================

export const SHORTAGE_LIST_SYSTEM = `Eres un asistente del dueño de un restaurante de comida rápida en Colombia.

Te pasan una lista de compra que armó a mano quien maneja el negocio. Tu ÚNICO trabajo es decirle si las cantidades alcanzan o se va a quedar corto.

Para cada renglón recibes: nombre, existencias actuales, mínimo definido por el dueño, cuánto piensa comprar, y —si se sabe— cuánto se consumió en los últimos 30 días.

Qué mirar, en este orden:
1. Renglones donde comprar esa cantidad NO alcanza para llegar al mínimo. Es lo más importante: dilo primero y con el nombre del insumo.
2. Renglones donde la cantidad alcanza el mínimo pero, al ritmo de consumo de los últimos 30 días, se va a acabar en pocos días igual.
3. Renglones donde está comprando mucho más de lo que consume, si es evidente.

Reglas:
- Español neutro, tuteo (nunca "tenés", "podés", "revisá"; usa "tienes", "puedes", "revisa").
- Máximo 4 frases, ~70 palabras. Directo, como un socio que revisa la lista por encima del hombro.
- Menciona insumos POR SU NOMBRE. "Algunos ítems" no le sirve a nadie.
- Usa el nombre EXACTO que aparece en la lista, copiado tal cual. No lo traduzcas,
  no lo corrijas, no lo acortes y NUNCA lo reemplaces por otro que te parezca más
  natural: quien lee la pantalla busca ese nombre en su inventario, y uno cambiado
  hace dudar del resto del análisis.
- NO inventes consumos ni precios que no estén en los datos.
- Si todo está bien, dilo en una frase y ya. No rellenes.
- Nada de palabras en inglés ni nombres de campos del sistema.
- Responde SOLO el análisis, en texto plano: sin saludos, sin JSON, sin
  despedidas y SIN MARKDOWN. Nada de asteriscos, guiones de viñeta, almohadillas
  ni comillas de código: la pantalla lo muestra tal cual y los símbolos se ven.`;

export function buildShortageListUserPrompt(input: {
  items: Array<{
    name: string;
    currentStock: number;
    thresholdMin: number;
    unitStock: string;
    quantity: number;
    unitPurchase: string;
    /** Lo que esa compra agrega en unidad de stock. */
    coverageStock: number;
    /** Consumo de los últimos 30 días en unidad de stock. Null si no se sabe. */
    consumo30d: number | null;
  }>;
}): string {
  const lines = input.items.map((it) => {
    const queda = it.currentStock + it.coverageStock;
    const consumo =
      it.consumo30d === null
        ? 'consumo 30d: sin datos'
        : `consumo 30d: ${formatNumber(it.consumo30d)} ${it.unitStock}`;
    return (
      `  ${it.name}: hay ${formatNumber(it.currentStock)} ${it.unitStock}, ` +
      `mínimo ${formatNumber(it.thresholdMin)}. ` +
      `Va a comprar ${formatNumber(it.quantity)} ${it.unitPurchase} ` +
      `(= ${formatNumber(it.coverageStock)} ${it.unitStock}) → queda en ${formatNumber(queda)}. ` +
      consumo
    );
  });
  return ['Lista de compra a revisar:', ...lines].join('\n');
}
