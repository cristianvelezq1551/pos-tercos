import {
  HistoricalSupplierSchema,
  PurchaseSuggestionSchema,
  ResolveSuggestionSchema,
  ScanResultSchema,
  SendToSupplierSchema,
  WhatsAppSendOutcomeSchema,
  type HistoricalSupplier,
  type PurchaseSuggestion,
  type ResolveSuggestion,
  type ScanResult,
  type SendToSupplier,
  type WhatsAppSendOutcome,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const SuggestionListSchema = z.array(PurchaseSuggestionSchema);
const SupplierListSchema = z.array(HistoricalSupplierSchema);
const SendOutcomeWithSuggestionSchema = z.object({
  outcome: WhatsAppSendOutcomeSchema,
  suggestion: PurchaseSuggestionSchema,
});

const EvaluateAllResultSchema = z.object({
  evaluated: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type EvaluateAllResult = z.infer<typeof EvaluateAllResultSchema>;

export function listSuggestions(opts: {
  status?: string;
  limit?: number;
} = {}): Promise<PurchaseSuggestion[]> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.limit) qs.set('limit', String(opts.limit));
  const qsStr = qs.toString();
  return request(
    `/purchase-suggestions${qsStr ? `?${qsStr}` : ''}`,
    { method: 'GET' },
    SuggestionListSchema,
  );
}

export function getSuggestion(id: string): Promise<PurchaseSuggestion> {
  return request(
    `/purchase-suggestions/${id}`,
    { method: 'GET' },
    PurchaseSuggestionSchema,
  );
}

export function runScan(): Promise<ScanResult> {
  return request(
    '/purchase-suggestions/admin/scan',
    { method: 'POST' },
    ScanResultSchema,
  );
}

export function evaluateSuggestion(id: string): Promise<PurchaseSuggestion> {
  return request(
    `/purchase-suggestions/${id}/evaluate`,
    { method: 'POST' },
    PurchaseSuggestionSchema,
  );
}

export function evaluateAllPending(): Promise<EvaluateAllResult> {
  return request(
    '/purchase-suggestions/admin/evaluate-all-pending',
    { method: 'POST' },
    EvaluateAllResultSchema,
  );
}

export function acceptSuggestion(
  id: string,
  input: ResolveSuggestion = {},
): Promise<PurchaseSuggestion> {
  ResolveSuggestionSchema.parse(input);
  return request(
    `/purchase-suggestions/${id}/accept`,
    { method: 'POST', body: JSON.stringify(input) },
    PurchaseSuggestionSchema,
  );
}

export function rejectSuggestion(
  id: string,
  input: ResolveSuggestion = {},
): Promise<PurchaseSuggestion> {
  ResolveSuggestionSchema.parse(input);
  return request(
    `/purchase-suggestions/${id}/reject`,
    { method: 'POST', body: JSON.stringify(input) },
    PurchaseSuggestionSchema,
  );
}

/** Lista proveedores que han vendido este item (sorted por más reciente). */
export function listSuggestionSuppliers(id: string): Promise<HistoricalSupplier[]> {
  return request(`/purchase-suggestions/${id}/suppliers`, { method: 'GET' }, SupplierListSchema);
}

/** Envía el pedido a UN proveedor por WhatsApp; marca la sugerencia ACCEPTED. */
export function sendToSupplier(
  id: string,
  input: SendToSupplier,
): Promise<{ outcome: WhatsAppSendOutcome; suggestion: PurchaseSuggestion }> {
  SendToSupplierSchema.parse(input);
  return request(
    `/purchase-suggestions/${id}/send-to-supplier`,
    { method: 'POST', body: JSON.stringify(input) },
    SendOutcomeWithSuggestionSchema,
  );
}

/** Envía un resumen de TODAS las sugerencias abiertas al WhatsApp de los admins/dueños. */
export function sendSuggestionsSummary(): Promise<WhatsAppSendOutcome> {
  return request(
    '/purchase-suggestions/admin/send-summary',
    { method: 'POST' },
    WhatsAppSendOutcomeSchema,
  );
}
