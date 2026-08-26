import {
  PurchaseListSchema,
  PurchaseListSummarySchema,
  ShortageCandidateSchema,
  type CreatePurchaseList,
  type PurchaseList,
  type PurchaseListSummary,
  type ShortageCandidate,
  type UpdatePurchaseList,
  type UpdatePurchaseListItem,
  type UpsertPurchaseListItem,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const ListSummaries = z.array(PurchaseListSummarySchema);
const Candidates = z.array(ShortageCandidateSchema);
const Ok = z.object({ ok: z.literal(true) });

const SuppliersInList = z.array(
  z.object({
    supplierId: z.string().uuid().nullable(),
    supplierName: z.string(),
    itemCount: z.number().int().nonnegative(),
  }),
);
export type SupplierInList = z.infer<typeof SuppliersInList>[number];

/**
 * El documento se valida flojo a propósito: lo consume el renderizador puro de
 * `@pos-tercos/domain`, que ya define su forma. Duplicar acá el schema del
 * papel solo crearía dos verdades que se separan al primer campo nuevo.
 */
const AnyDoc = z.record(z.unknown());

export function listPurchaseLists(limit = 50): Promise<PurchaseListSummary[]> {
  return request(`/purchase-lists?limit=${limit}`, { method: 'GET' }, ListSummaries);
}

export function getPurchaseList(id: string): Promise<PurchaseList> {
  return request(`/purchase-lists/${id}`, { method: 'GET' }, PurchaseListSchema);
}

export function listCandidates(onlyLow = false): Promise<ShortageCandidate[]> {
  return request(
    `/purchase-lists/candidates${onlyLow ? '?only_low=true' : ''}`,
    { method: 'GET' },
    Candidates,
  );
}

export function createPurchaseList(input: CreatePurchaseList): Promise<PurchaseList> {
  return request(
    '/purchase-lists',
    { method: 'POST', body: JSON.stringify(input) },
    PurchaseListSchema,
  );
}

export function updatePurchaseList(
  id: string,
  input: UpdatePurchaseList,
): Promise<PurchaseList> {
  return request(
    `/purchase-lists/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    PurchaseListSchema,
  );
}

export function addItem(id: string, input: UpsertPurchaseListItem): Promise<PurchaseList> {
  return request(
    `/purchase-lists/${id}/items`,
    { method: 'POST', body: JSON.stringify(input) },
    PurchaseListSchema,
  );
}

export function updateItem(
  id: string,
  itemId: string,
  input: UpdatePurchaseListItem,
): Promise<PurchaseList> {
  return request(
    `/purchase-lists/${id}/items/${itemId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    PurchaseListSchema,
  );
}

export function removeItem(id: string, itemId: string): Promise<PurchaseList> {
  return request(
    `/purchase-lists/${id}/items/${itemId}`,
    { method: 'DELETE' },
    PurchaseListSchema,
  );
}

export function closePurchaseList(id: string): Promise<PurchaseList> {
  return request(`/purchase-lists/${id}/close`, { method: 'POST' }, PurchaseListSchema);
}

export async function deletePurchaseList(id: string): Promise<void> {
  await request(`/purchase-lists/${id}`, { method: 'DELETE' }, Ok);
}

export function reviewWithAi(id: string): Promise<PurchaseList> {
  return request(`/purchase-lists/${id}/review`, { method: 'POST' }, PurchaseListSchema);
}

export function listSuppliersInList(id: string): Promise<SupplierInList[]> {
  return request(`/purchase-lists/${id}/suppliers`, { method: 'GET' }, SuppliersInList);
}

export function getGeneralDoc(id: string): Promise<Record<string, unknown>> {
  return request(`/purchase-lists/${id}/document`, { method: 'GET' }, AnyDoc);
}

export function getSupplierDoc(
  id: string,
  supplierId: string | null,
): Promise<Record<string, unknown>> {
  const qs = supplierId ? `?supplier_id=${encodeURIComponent(supplierId)}` : '?supplier_id=none';
  return request(`/purchase-lists/${id}/document/supplier${qs}`, { method: 'GET' }, AnyDoc);
}
