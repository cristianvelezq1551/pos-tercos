import type { BusinessConfig } from '@pos-tercos/types';
import { BusinessConfigSchema } from '@pos-tercos/types';
import { serverFetchJson } from '../../lib/api-server';

/** Lee la config del negocio en Server Components. Fallback al mes calendario. */
export async function getBusinessConfigServer(): Promise<BusinessConfig> {
  try {
    return await serverFetchJson<BusinessConfig>('/business-config', undefined, BusinessConfigSchema);
  } catch {
    return { monthStartDay: 1, webOrdersEnabled: true };
  }
}
