import type { CortesiaStatus } from '@pos-tercos/types';

/** Etiquetas legibles: la cortesía ya ocurrió, el dueño la REVISA. */
export const CORTESIA_STATUS_LABEL: Record<CortesiaStatus, string> = {
  PENDING: 'Sin revisar',
  APPROVED: 'Autorizada',
  REJECTED: 'Rechazada',
};

export const CORTESIA_STATUS_TONE: Record<CortesiaStatus, string> = {
  PENDING: 'text-warning',
  APPROVED: 'text-success',
  REJECTED: 'text-destructive',
};
