'use client';

import { GuiaAsistente } from '@pos-tercos/guia';
import { askGuia } from './ask';

/** Une el componente del asistente con el cliente HTTP de esta app. */
export function GuiaAsistentePanel() {
  return <GuiaAsistente ask={askGuia} />;
}
