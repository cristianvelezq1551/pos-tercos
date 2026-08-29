'use client';

import { instalarReporteDeErrores } from '@pos-tercos/ui';
import { useEffect } from 'react';

/**
 * Manda al servidor los errores que revientan en el navegador. Va en el layout
 * raíz para cubrir TODAS las pantallas, incluida la de login. No pinta nada.
 */
export function ClientErrorReporter() {
  useEffect(() => instalarReporteDeErrores('cocina'), []);
  return null;
}
