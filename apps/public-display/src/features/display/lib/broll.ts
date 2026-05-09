import type { MarqueeBRollImage } from '@pos-tercos/brand';

/**
 * B-roll de productos que se sirve desde `apps/public-display/public/broll/`.
 * Usado como fallback en el mosaico del estado "preparando" cuando los pedidos
 * en cola no tienen imágenes propias, y como background lento en el estado
 * vacío total.
 */
export const BROLL_IMAGES: MarqueeBRollImage[] = [
  { url: '/broll/hamburguesaTercos.png', alt: 'Hamburguesa Tercos' },
  { url: '/broll/hamburguesaClasica.png', alt: 'Hamburguesa clásica' },
  { url: '/broll/macChese.png', alt: 'Mac & cheese' },
  { url: '/broll/polloColeslaw.png', alt: 'Pollo coleslaw' },
  { url: '/broll/burritoCarne.png', alt: 'Burrito de carne' },
  { url: '/broll/papasNash.png', alt: 'Papas nash' },
];
