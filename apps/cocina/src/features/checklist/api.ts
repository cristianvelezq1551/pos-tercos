import {
  ChecklistDaySchema,
  type ChecklistDay,
  type ChecklistType,
  type CompleteChecklist,
  type MarkChecklistItem,
} from '@pos-tercos/types';
import { apiGet, apiSend } from '../../lib/api-client';

export function fetchChecklist(type: ChecklistType): Promise<ChecklistDay> {
  return apiGet(`/kitchen/checklist?type=${type}`, ChecklistDaySchema);
}

/** Marca o desmarca una tarea. Devuelve la rutina completa ya recalculada. */
export function markChecklistItem(body: MarkChecklistItem): Promise<ChecklistDay> {
  return apiSend('/kitchen/checklist/mark', body, ChecklistDaySchema);
}

export function completeChecklist(body: CompleteChecklist): Promise<ChecklistDay> {
  return apiSend('/kitchen/checklist/complete', body, ChecklistDaySchema);
}
