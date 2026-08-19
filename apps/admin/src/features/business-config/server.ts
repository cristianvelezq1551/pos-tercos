import type { BusinessConfig } from '@pos-tercos/types';
import { BusinessConfigSchema, DEFAULT_BUSINESS_CONFIG } from '@pos-tercos/types';
import { serverFetchJson } from '../../lib/api-server';

/** Lee la config del negocio en Server Components. Fallback a valores neutros. */
export async function getBusinessConfigServer(): Promise<BusinessConfig> {
  try {
    return await serverFetchJson<BusinessConfig>('/business-config', undefined, BusinessConfigSchema);
  } catch {
    return DEFAULT_BUSINESS_CONFIG;
  }
}
