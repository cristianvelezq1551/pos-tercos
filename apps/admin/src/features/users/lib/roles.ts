import { USER_ROLE_LABELS, type UserRole } from '@pos-tercos/types';

/** Re-export del catálogo canónico de @pos-tercos/types. */
export const ROLE_LABEL = USER_ROLE_LABELS;

export const ROLE_OPTIONS: { value: UserRole; label: string }[] = (
  ['CAJERO', 'COCINERO', 'TRABAJADOR', 'ADMIN_OPERATIVO', 'DUENO'] as UserRole[]
).map((value) => ({ value, label: ROLE_LABEL[value] }));

/** Roles que pueden tener PIN de aprobación (anular ventas, cajón sin venta). */
export const PIN_ROLES: UserRole[] = ['ADMIN_OPERATIVO', 'DUENO'];
