import type { UserRole } from '@pos-tercos/types';

/** Roles que pueden entrar a la app de cocina (mismo set que @KitchenAccess). */
export const COCINA_ALLOWED_ROLES: readonly UserRole[] = [
  'COCINERO',
  'ADMIN_OPERATIVO',
  'DUENO',
] as const;

export const APP_LABEL = 'Cocina Tercos';
