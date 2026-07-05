// Labels compartidos entre breakdowns y la tabla de pedidos de la sesión.
// El método usa el catálogo canónico de @pos-tercos/types (única fuente, incluye
// CARD) para no divergir en la grafía (ej. Daviplata).

import { PAYMENT_METHOD_LABELS } from '@pos-tercos/types';

export const METHOD_LABEL: Record<string, string> = PAYMENT_METHOD_LABELS;

export const TYPE_LABEL: Record<string, string> = {
  COUNTER: 'Mostrador',
  WEB_PICKUP: 'Web (retiro)',
};
