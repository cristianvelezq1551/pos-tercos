import type { CortesiaStatus } from '@pos-tercos/types';

/** Etiquetas legibles: la cortesía se aplica al instante; el dueño la ve. */
export const CORTESIA_STATUS_LABEL: Record<CortesiaStatus, string> = {
  PENDING: 'Sin revisar',
  APPROVED: 'Registrada',
  REJECTED: 'Rechazada',
  REVERSED: 'Anulada',
};

export const CORTESIA_STATUS_TONE: Record<CortesiaStatus, string> = {
  PENDING: 'text-warning',
  APPROVED: 'text-success',
  REJECTED: 'text-destructive',
  REVERSED: 'text-muted-foreground',
};
