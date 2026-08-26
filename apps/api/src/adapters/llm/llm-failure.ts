/**
 * Traduce un fallo del proveedor de IA a algo que la persona pueda accionar.
 *
 * El error crudo viene en inglés técnico ("invalid x-api-key", "rate_limit_
 * error") y llegaba TAL CUAL a la pantalla: al subir una factura el admin
 * mostraba "— No LLM provider configured. Set ANTHROPIC_API_KEY or
 * OPENAI_API_KEY". Eso incumple §3 (un error dice QUÉ pasó y QUÉ hacer, sin
 * nombres de variables ni códigos).
 *
 * El texto crudo NO se pierde: va al log del servidor, que es donde sirve.
 *
 * Único lugar donde se traduce — lo usan la extracción de facturas y la
 * evaluación de sugerencias de compra, que fallan por las mismas razones.
 */
export function describeLlmFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (lower.includes('no llm provider') || lower.includes('no está configurado')) {
    return 'El asistente de IA no está configurado en el servidor. Avísale al dueño para que active la llave.';
  }
  if (
    lower.includes('authentication') ||
    lower.includes('invalid x-api-key') ||
    lower.includes('401')
  ) {
    return 'La llave de IA no es válida o fue revocada. Hay que generar una nueva.';
  }
  if (lower.includes('credit') || lower.includes('quota') || lower.includes('billing')) {
    return 'La cuenta de IA se quedó sin saldo.';
  }
  if (lower.includes('rate') && lower.includes('limit')) {
    return 'La IA está recibiendo demasiadas peticiones. Espera un momento y vuelve a intentar.';
  }
  if (lower.includes('overloaded') || lower.includes('529')) {
    return 'El servicio de IA está saturado en este momento. Vuelve a intentar en un minuto.';
  }
  if (
    lower.includes('timeout') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed')
  ) {
    return 'No se pudo conectar con el servicio de IA. Revisa la conexión del servidor.';
  }
  if (lower.includes('did not return valid json') || lower.includes('empty')) {
    return 'La IA respondió algo que no se pudo leer. Vuelve a intentar.';
  }
  return 'El servicio de IA respondió con un error. Vuelve a intentar; si sigue igual, avísale al dueño.';
}
