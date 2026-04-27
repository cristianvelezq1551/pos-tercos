import type { UserRole } from '@pos-tercos/types';

/**
 * Roles autorizados para acceder al Admin.
 * Cualquier user con rol distinto será redirigido a /unauthorized.
 */
export const ADMIN_ALLOWED_ROLES: readonly UserRole[] = ['ADMIN_OPERATIVO', 'DUENO'] as const;

export const APP_LABEL = 'POS Tercos · Admin';
