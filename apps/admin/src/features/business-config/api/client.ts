import {
  BusinessConfigSchema,
  UpdateBusinessConfigSchema,
  type BusinessConfig,
  type UpdateBusinessConfig,
} from '@pos-tercos/types';
import { request, validateInput } from '../../../lib/api-client';

export function getBusinessConfig(): Promise<BusinessConfig> {
  return request('/business-config', { method: 'GET' }, BusinessConfigSchema);
}

export function updateBusinessConfig(input: UpdateBusinessConfig): Promise<BusinessConfig> {
  validateInput(UpdateBusinessConfigSchema, input);
  return request(
    '/business-config',
    { method: 'PATCH', body: JSON.stringify(input) },
    BusinessConfigSchema,
  );
}

/** Foto de "Nosotros". Va por multipart, no por el `request()` de JSON. */
export function uploadAboutImage(media: File): Promise<BusinessConfig> {
  const body = new FormData();
  body.append('media', media);
  return request('/business-config/about-image', { method: 'POST', body }, BusinessConfigSchema);
}
