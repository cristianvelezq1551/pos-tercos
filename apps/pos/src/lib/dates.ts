import { startOfBusinessDay } from '@pos-tercos/domain';

/**
 * Inicio del día de NEGOCIO (corte 4 am, hora local del dispositivo) en ISO —
 * filtro estándar de "lo del día" en las vistas operativas del cajero.
 * Con el local vendiendo de madrugada, a la 1 am el historial y el panel de
 * pedidos siguen mostrando la operación de la noche (no se vacían a las 00:00).
 */
export function startOfTodayIso(): string {
  return startOfBusinessDay(new Date()).toISOString();
}
