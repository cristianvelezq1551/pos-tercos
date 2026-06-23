import { SupplierSchema, type Supplier } from '@pos-tercos/types';
import { z } from 'zod';
import { request } from '../../../lib/api-client';

const SupplierListSchema = z.array(SupplierSchema);

export function listSuppliers(): Promise<Supplier[]> {
  return request('/suppliers', { method: 'GET' }, SupplierListSchema);
}
