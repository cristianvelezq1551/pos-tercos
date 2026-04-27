import { z } from 'zod';

export const AuditActionEnum = z.enum([
  // Auth
  'AUTH_LOGIN',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'AUTH_REFRESH',
  'AUTH_REFRESH_FAILED',
  'AUTH_PASSWORD_CHANGED',

  // Catalog
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_DEACTIVATED',
  'SUBPRODUCT_CREATED',
  'SUBPRODUCT_UPDATED',
  'SUBPRODUCT_DEACTIVATED',
  'INGREDIENT_CREATED',
  'INGREDIENT_UPDATED',
  'INGREDIENT_DEACTIVATED',
  'RECIPE_UPDATED',

  // Inventory
  'INVENTORY_MOVEMENT_MANUAL',
  'INVENTORY_MOVEMENT_WASTE',
  'INVENTORY_MOVEMENT_INITIAL',
  'INVENTORY_MOVEMENT_PURCHASE',
  'INVENTORY_MOVEMENT_SALE',

  // Sales / cash (FASE 5+)
  'SALE_VOIDED',
  'DISCOUNT_APPLIED_OVER_THRESHOLD',
  'CASH_DRAWER_OPENED_NO_SALE',
  'SHIFT_OPENED',
  'SHIFT_CLOSED',
  'SHIFT_DISCREPANCY_DETECTED',

  // Approvals
  'APPROVAL_GRANTED',
  'APPROVAL_DENIED',
]);
export type AuditAction = z.infer<typeof AuditActionEnum>;

export const AuditLogEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  userFullName: z.string().nullable().optional(),
  userEmail: z.string().email().nullable().optional(),
  action: AuditActionEnum,
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
