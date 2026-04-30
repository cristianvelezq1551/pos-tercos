import type { UserRole } from '@pos-tercos/types';

export const POS_ALLOWED_ROLES: readonly UserRole[] = [
  'CAJERO',
  'ADMIN_OPERATIVO',
  'DUENO',
] as const;

export const APP_LABEL = 'POS Tercos · Cajero';
