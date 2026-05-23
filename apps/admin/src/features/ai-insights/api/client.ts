import { AiSummarySchema, type AiSummary } from '@pos-tercos/types';

async function getJson(path: string): Promise<AiSummary> {
  const res = await fetch(`/api${path}`, { credentials: 'include' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Error ${res.status}`);
  }
  return AiSummarySchema.parse(await res.json());
}

/** Asistente de cierre: explica el descuadre de una caja CERRADA. */
export function fetchCloseAnalysis(shiftId: string): Promise<AiSummary> {
  return getJson(`/shifts/${shiftId}/close-analysis`);
}

/** Resumen diario en lenguaje natural (date = YYYY-MM-DD, default hoy). */
export function fetchDailySummary(date?: string): Promise<AiSummary> {
  return getJson(`/reports/daily-ai-summary${date ? `?date=${date}` : ''}`);
}
