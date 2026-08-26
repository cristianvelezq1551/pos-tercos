import {
  ProductionRunSchema,
  SubproductProductionStatusSchema,
  type ProductionRun,
  type RecordProduction,
  type SubproductProductionStatus,
} from '@pos-tercos/types';
import { z } from 'zod';
import { apiGet, apiSend } from '../../lib/api-client';
import { uploadEvidence as uploadTo } from '../../lib/evidence';

export function fetchProductionStatus(): Promise<SubproductProductionStatus[]> {
  return apiGet('/subproducts/production-status', z.array(SubproductProductionStatusSchema));
}

export function produce(subproductId: string, body: RecordProduction): Promise<ProductionRun> {
  return apiSend(`/subproducts/${subproductId}/produce`, body, ProductionRunSchema);
}

/**
 * Sube la foto de la tanda y devuelve su key. Reusa el helper compartido —
 * mismo achicado antes de subir que merma e incidencias— contra el endpoint
 * propio de producción, que guarda con su prefijo.
 */
export function uploadEvidence(file: File): Promise<string> {
  return uploadTo(file, '/api/subproducts/production/evidence');
}
