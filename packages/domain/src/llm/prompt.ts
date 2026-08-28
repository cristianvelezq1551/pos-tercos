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
- NO inventes datos. Es preferible warnings y nulls que data falsa.`;

export const INVOICE_EXTRACTION_USER = `Esta es la foto de una factura. Devuelve el JSON estructurado según el schema indicado.`;

/**
 * Normaliza los items crudos del LLM antes del Zod parse: garantiza que cada
 * item tenga las claves de empaque (packUnits/packSizePerUnit/packSizeMeasure)
 * en null si el modelo las omitió. Los valores presentes ganan sobre el default.
 */
export function normalizeExtractedItems(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((it) =>
    it && typeof it === 'object'
      ? { packUnits: null, packSizePerUnit: null, packSizeMeasure: null, ...(it as object) }
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

export const FINANCIAL_ANALYSIS_SYSTEM = `Eres el analista financiero del dueño de un restaurante de comida rápida en Colombia. Te dan el estado financiero del mes y la tendencia de los meses anteriores, y devuelves un análisis breve y accionable en español.

REGLAS DURAS:
- Responde EXCLUSIVAMENTE con un JSON válido con esta forma exacta:
  {"tono":"saludable|atencion|critico","titular":"...","bullets":[{"tipo":"positivo|vigilar|accion","texto":"..."}],"siguiente_paso":"..."}
- "tono": "saludable" si el neto es positivo y la cobertura del break-even >= 100%. "atencion" si está entre 80% y 99%. "critico" si está debajo de 80% o el neto es negativo.
- "titular": UNA frase. Empieza con el resultado: cuánto ganó/perdió, contra el break-even. Incluye una cifra concreta en pesos.
- "bullets": 3 a 5 puntos. Mix de positivos (qué va bien), vigilar (riesgos numéricos) y acción (qué hacer concreto). Cada bullet UNA frase, con número o porcentaje cuando aplique.
- "siguiente_paso": UNA acción concreta para el próximo mes, basada solo en los datos. No moralices ni filosofes.
- NO inventes datos. NO menciones cifras que no estén en el input.
- Español neutro (no uses voseo: nunca "tenés", "podés", "revisá"; usa "tienes", "puedes", "revisa"). Tono directo, sin jerga financiera complicada.`;

export interface FinancialAnalysisInput {
  year: number;
  month: number; // 1-12
  monthLabel: string; // "mayo 2026"
  revenue: number;
  cogs: number;
  grossMargin: number;
  grossMarginPct: number; // 0..1
  totalFixed: number;
  fixedCosts: ReadonlyArray<{
    name: string;
    category: string;
    monthlyAmount: number;
    isPayroll: boolean;
  }>;
  netResult: number;
  breakEven: number | null;
  breakEvenCoverage: number | null; // 0..1+
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
    `Estado financiero del mes (${i.monthLabel}):`,
    `- Ingresos: ${cop(i.revenue)}`,
    `- COGS (costo real FIFO de lo vendido): ${cop(i.cogs)}`,
    `- Margen bruto: ${cop(i.grossMargin)} (${pct(i.grossMarginPct)})`,
    `- Costos fijos totales: ${cop(i.totalFixed)}`,
  ];
  if (i.fixedCosts.length > 0) {
    lines.push('  Desglose de costos fijos:');
    for (const c of i.fixedCosts) {
      const tag = c.isPayroll ? ' [auto desde Nómina]' : '';
      lines.push(`    · ${c.name} (${c.category}): ${cop(c.monthlyAmount)}${tag}`);
    }
  }
  lines.push(`- Resultado neto: ${cop(i.netResult)}`);
  if (i.breakEven !== null) {
    lines.push(`- Punto de equilibrio (break-even): ${cop(i.breakEven)}`);
  }
  if (i.breakEvenCoverage !== null) {
    lines.push(`- Cobertura del break-even: ${pct(Math.min(i.breakEvenCoverage, 2))}`);
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
- NO inventes consumos ni precios que no estén en los datos.
- Si todo está bien, dilo en una frase y ya. No rellenes.
- Nada de palabras en inglés ni nombres de campos del sistema.
- Responde SOLO el análisis: sin saludos, sin JSON, sin markdown, sin despedidas.`;

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
