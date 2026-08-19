import {
  CurrentShiftStatusSchema,
  ShiftSchema,
  type CurrentShiftStatus,
  type Shift,
} from '@pos-tercos/types';
import { serverFetch } from '../../lib/api-server';

export async function getCurrentShiftServer(): Promise<Shift | null> {
  const res = await serverFetch('/shifts/current');
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as unknown;
  if (json === null) return null;
  const parsed = ShiftSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * Estado de caja: turno actual + si quedó abierto de un día anterior (hay que
 * cerrarlo antes de operar). El backend calcula la "fecha de hoy" en su TZ
 * (America/Bogota en prod), evitando errores de zona horaria en el frontend.
 */
export async function getCurrentShiftStatusServer(): Promise<CurrentShiftStatus> {
  const res = await serverFetch('/shifts/current-status');
  if (!res.ok) return { shift: null, stalePreviousDay: false };
  const json = (await res.json().catch(() => null)) as unknown;
  const parsed = CurrentShiftStatusSchema.safeParse(json);
  return parsed.success ? parsed.data : { shift: null, stalePreviousDay: false };
}
