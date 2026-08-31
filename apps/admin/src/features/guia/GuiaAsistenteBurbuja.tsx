'use client';

import { GuiaAsistenteFlotante } from '@pos-tercos/guia';
import { askGuia } from './ask';

/**
 * La ayuda de la guía como burbuja en la esquina inferior derecha, montada en
 * el shell de gestión. En la caja NO se monta: ahí abajo a la derecha vive el
 * botón de "Cobrar".
 */
export function GuiaAsistenteBurbuja() {
  return <GuiaAsistenteFlotante ask={askGuia} />;
}
