/**
 * Saca el ÚNICO objeto JSON de la respuesta de un modelo, tolerando lo que
 * los modelos hacen aunque se les pida "solo JSON": cercas de código, una
 * frase antes o después, espacios. Devuelve `null` si no hay un objeto
 * completo y parseable — una respuesta truncada por el tope de tokens llega
 * sin su llave de cierre y eso es exactamente lo que hay que detectar, no
 * "arreglar".
 *
 * Pura. La usa el análisis financiero; el adapter de facturas tiene su propio
 * strip de cercas porque su respuesta va a un schema Zod aparte.
 */
export function extractJsonObject(raw: string): unknown | null {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
