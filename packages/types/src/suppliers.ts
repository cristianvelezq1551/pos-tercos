import { z } from 'zod';

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  nit: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const CreateSupplierSchema = z.object({
  nit: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(120).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;

export const UpdateSupplierSchema = CreateSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateSupplier = z.infer<typeof UpdateSupplierSchema>;

export const SupplierProductSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  ingredientName: z.string().optional(),
  lastUnitPrice: z.number().nullable(),
  lastPurchaseDate: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SupplierProduct = z.infer<typeof SupplierProductSchema>;
