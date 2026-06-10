import type { UserRole } from '@pos-tercos/types';

export const ROLE_LABEL: Record<UserRole, string> = {
  DUENO: 'Dueño',
  ADMIN_OPERATIVO: 'Admin operativo',
  CAJERO: 'Cajero',
  COCINERO: 'Cocinero',
  TRABAJADOR: 'Trabajador',
};

export const ROLE_OPTIONS: { value: UserRole; label: string }[] = (
  ['CAJERO', 'COCINERO', 'TRABAJADOR', 'ADMIN_OPERATIVO', 'DUENO'] as UserRole[]
).map((value) => ({ value, label: ROLE_LABEL[value] }));

/** Roles que pueden tener PIN de aprobación (anular ventas, cajón sin venta). */
export const PIN_ROLES: UserRole[] = ['ADMIN_OPERATIVO', 'DUENO'];
