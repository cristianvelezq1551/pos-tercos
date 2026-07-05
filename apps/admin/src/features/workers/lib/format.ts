import { USER_ROLE_LABELS, type PayType, type UserRole } from '@pos-tercos/types';

export const PAY_TYPE_LABEL: Record<PayType, string> = {
  MONTHLY: 'Mensual',
  DAILY: 'Diario',
};

export const ROLE_LABEL = USER_ROLE_LABELS;

export function roleLabel(role: string): string {
  return USER_ROLE_LABELS[role as UserRole] ?? role;
}
