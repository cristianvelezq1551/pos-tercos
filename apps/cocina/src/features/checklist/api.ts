import {
  ChecklistTodaySchema,
  type ChecklistToday,
  type ChecklistType,
  type CompleteChecklist,
} from '@pos-tercos/types';
import { apiGet, apiSend } from '../../lib/api-client';

export function fetchChecklist(type: ChecklistType): Promise<ChecklistToday> {
  return apiGet(`/kitchen/checklist?type=${type}`, ChecklistTodaySchema);
}

export function completeChecklist(body: CompleteChecklist): Promise<ChecklistToday> {
  return apiSend('/kitchen/checklist/complete', body, ChecklistTodaySchema);
}
