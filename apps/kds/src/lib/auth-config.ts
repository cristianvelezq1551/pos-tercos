import type { UserRole } from '@pos-tercos/types';

export const KDS_ALLOWED_ROLES: readonly UserRole[] = [
  'COCINERO',
  'ADMIN_OPERATIVO',
  'DUENO',
] as const;

export const APP_LABEL = 'POS Tercos · Cocina';
