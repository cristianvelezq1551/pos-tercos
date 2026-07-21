import { USER_ROLE_LABELS, type UserRole } from '@pos-tercos/types';

/** Re-export del catálogo canónico de @pos-tercos/types. */
export const ROLE_LABEL = USER_ROLE_LABELS;

// CAJERO se retiró de la operación en el cutover POS→admin (2026-07-21): no
// puede entrar a ninguna app, así que no se ofrece al crear/editar usuarios.
// El valor de enum sobrevive para leer usuarios históricos migrados; los
// operadores de caja son ADMIN_OPERATIVO.
export const ROLE_OPTIONS: { value: UserRole; label: string }[] = (
  ['COCINERO', 'TRABAJADOR', 'ADMIN_OPERATIVO', 'DUENO'] as UserRole[]
).map((value) => ({ value, label: ROLE_LABEL[value] }));

/** Roles que pueden tener PIN de aprobación (anular ventas, cajón sin venta). */
export const PIN_ROLES: UserRole[] = ['ADMIN_OPERATIVO', 'DUENO'];
