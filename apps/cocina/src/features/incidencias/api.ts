import {
  KitchenIncidentSchema,
  type CreateKitchenIncident,
  type KitchenIncident,
} from '@pos-tercos/types';
import { z } from 'zod';
import { apiGet, apiSend } from '../../lib/api-client';

export function fetchIncidents(onlyOpen = false): Promise<KitchenIncident[]> {
  return apiGet(`/kitchen/incidents${onlyOpen ? '?only_open=true' : ''}`, z.array(KitchenIncidentSchema));
}

export function createIncident(body: CreateKitchenIncident): Promise<KitchenIncident> {
  return apiSend('/kitchen/incidents', body, KitchenIncidentSchema);
}
