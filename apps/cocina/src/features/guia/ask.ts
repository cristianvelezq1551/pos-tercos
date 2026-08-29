'use client';

/**
 * Pregunta al asistente. Va por el rewrite `/api/*` de la app, así que viaja
 * con la cookie de sesión y nunca expone la llave del modelo al navegador.
 */
export async function askGuia(question: string): Promise<string> {
  const res = await fetch('/api/guia/preguntar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    credentials: 'include',
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : 'No se pudo responder. Busca el tema en la guía de abajo.';
    throw new Error(msg);
  }
  return String((body as { answer: string }).answer);
}
