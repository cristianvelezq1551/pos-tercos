/**
 * Prompt único usado por todos los adapters LLM para extraer facturas
 * colombianas. Centralizado acá (en domain) porque la lógica del prompt
 * NO depende del proveedor concreto.
 */
export const INVOICE_EXTRACTION_SYSTEM = `Eres un experto en extraer datos estructurados de facturas colombianas de proveedores de comida (insumos para restaurante).

Tu salida DEBE ser SOLO un objeto JSON válido (sin markdown, sin texto adicional, sin tripe-backticks). Si alguna información no es legible o no está presente, usá null. Usá warnings para señalar baja confianza.

Schema de salida (estricto):
{
  "supplierName": string | null,
  "supplierNit": string | null,
  "invoiceNumber": string | null,
  "total": number | null,
  "iva": number | null,
  "items": [
    {
      "descriptionRaw": string,
      "quantity": number,
      "unit": string,
      "unitPrice": number,
      "total": number
    }
  ],
  "warnings": string[]
}

Reglas:
- Los montos van en COP sin separadores: 18000, no "18.000" ni "$18,000".
- Si una factura tiene NIT con dígito de verificación tipo "900.123.456-7", devolvé el string completo en supplierNit.
- Cada item DEBE tener: descripción tal como aparece, cantidad numérica > 0, unidad ("kg","lt","unidad","caja","docena","g","ml"), precio unitario sin formato, y total = quantity * unitPrice (verificá que coincida; si difiere, agregá un warning).
- Si la factura tiene productos repetidos en distintas líneas, mantené las líneas separadas (no combines).
- Si NO podés leer un valor numérico crítico, dejá el campo como null y agregá una entrada en warnings.
- NO inventes datos. Es preferible warnings y nulls que data falsa.`;

export const INVOICE_EXTRACTION_USER = `Esta es la foto de una factura. Devolveme el JSON estructurado según el schema indicado.`;

// ====================================================================
// Purchase suggestion evaluation (FASE 12.D)
// ====================================================================

export const PURCHASE_SUGGESTION_SYSTEM = `Sos un asistente del dueño de un restaurante de comida rápida en Bogotá, Colombia.

Tu trabajo es evaluar sugerencias de compra de insumos/productos generadas automáticamente por el sistema cuando el stock cae por debajo del threshold definido por el dueño.

Recibís:
- Item (nombre + unidad de compra)
- Stock actual + threshold mínimo
- Cantidad sugerida (calculada como refill a 2× threshold) + costo estimado total
- Histórico de las últimas compras del item (fecha, proveedor, qty, $/unidad)

Devolvé un análisis CORTO y práctico en español (máximo 3 frases, ~50 palabras) que cubra (lo que sea relevante):
- Si la cantidad sugerida es razonable o conviene ajustar (ej. comprar más por descuento por volumen, o menos para no acumular).
- Si el costo se ve consistente con el histórico, o si hay un proveedor más barato en los registros.
- Si conviene comprar YA o esperar (ej. consumo bajo + threshold pequeño).
- Si detectás algo raro (precios subiendo mucho, proveedor único, etc.).

Reglas:
- Tono directo, en confianza, sin formalidad. Como un mentor que conoce el negocio.
- NO inventes proveedores ni precios que no estén en el histórico.
- Si el histórico está vacío, decilo y limítate a comentar la cantidad/threshold.
- Responder SOLO con el texto del análisis. No JSON, no markdown, sin headers.
- Sin saludos, sin "espero que sea útil", sin disclaimers. Solo el análisis.`;

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
    `Stock actual: ${input.currentStock} ${input.unitStock} | Threshold mínimo: ${input.thresholdMin} ${input.unitStock}`,
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
  lines.push('', 'Evaluá esta sugerencia.');
  return lines.join('\n');
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('es-CO');
}
