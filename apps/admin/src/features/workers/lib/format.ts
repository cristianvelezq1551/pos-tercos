import type { PayType } from '@pos-tercos/types';

export const PAY_TYPE_LABEL: Record<PayType, string> = {
  MONTHLY: 'Mensual',
  DAILY: 'Diario',
};

export const ROLE_LABEL: Record<string, string> = {
  DUENO: 'Dueño',
  ADMIN_OPERATIVO: 'Admin operativo',
  CAJERO: 'Cajero',
  COCINERO: 'Cocinero',
  TRABAJADOR: 'Trabajador',
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}
