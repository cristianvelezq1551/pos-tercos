import {
  CreateSupplierSchema,
  SupplierSchema,
  UpdateSupplierSchema,
  type CreateSupplier,
  type Supplier,
  type UpdateSupplier,
} from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const SupplierListSchema = z.array(SupplierSchema);

export function listSuppliers(): Promise<Supplier[]> {
  return request('/suppliers', { method: 'GET' }, SupplierListSchema);
}

export function getSupplier(id: string): Promise<Supplier> {
  return request(`/suppliers/${id}`, { method: 'GET' }, SupplierSchema);
}

export function createSupplier(input: CreateSupplier): Promise<Supplier> {
  CreateSupplierSchema.parse(input);
  return request(
    '/suppliers',
    { method: 'POST', body: JSON.stringify(input) },
    SupplierSchema,
  );
}

export function updateSupplier(id: string, input: UpdateSupplier): Promise<Supplier> {
  UpdateSupplierSchema.parse(input);
  return request(
    `/suppliers/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    SupplierSchema,
  );
}

export function deactivateSupplier(id: string): Promise<Supplier> {
  return request(`/suppliers/${id}`, { method: 'DELETE' }, SupplierSchema);
}
