import {
  ProductionEvidenceUploadSchema,
  ProductionRunSchema,
  SubproductProductionStatusSchema,
  type ProductionRun,
  type RecordProduction,
  type SubproductProductionStatus,
} from '@pos-tercos/types';
import { z } from 'zod';
import { apiGet, apiSend } from '../../lib/api-client';

export function fetchProductionStatus(): Promise<SubproductProductionStatus[]> {
  return apiGet('/subproducts/production-status', z.array(SubproductProductionStatusSchema));
}

export function produce(subproductId: string, body: RecordProduction): Promise<ProductionRun> {
  return apiSend(`/subproducts/${subproductId}/produce`, body, ProductionRunSchema);
}

/** Sube la foto de evidencia y devuelve su key (para pasar a `produce`). */
export async function uploadEvidence(file: File): Promise<string> {
  const form = new FormData();
  form.append('photo', file);
  const res = await fetch('/api/subproducts/production/evidence', {
    method: 'POST',
    headers: { 'X-Client-App': 'cocina' }, // sin Content-Type: el browser pone el boundary
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return ProductionEvidenceUploadSchema.parse(await res.json()).key;
}
