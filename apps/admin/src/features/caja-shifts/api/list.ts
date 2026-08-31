import {
  ShiftSchema,
  ShiftSessionDetailSchema,
  type Shift,
  type ShiftSessionDetail,
} from '@pos-tercos/types';
import { z } from 'zod';

/** Cajas cerradas (historial de arqueos), más reciente primero. */
export async function listClosedShifts(limit = 60): Promise<Shift[]> {
  const res = await fetch(`/api/shifts?status=CLOSED&limit=${limit}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return z.array(ShiftSchema).parse(await res.json());
}

/** Detalle consolidado de una sesión (ventas, arqueos, movimientos). */
export async function getShiftDetail(shiftId: string): Promise<ShiftSessionDetail> {
  const res = await fetch(`/api/shifts/${shiftId}/detail`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return ShiftSessionDetailSchema.parse(await res.json());
}
