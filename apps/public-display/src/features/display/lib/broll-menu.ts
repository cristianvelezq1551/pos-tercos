/**
 * Catálogo de marketing del turnero — el B-roll real curado por el dueño,
 * portado verbatim del sitio de señalética TERCOS-WEB (`index.html`).
 *
 * Esto reemplaza los slides con precios/productos inventados que tenía el
 * turnero antes. Si el menú cambia, se edita ACÁ (un solo lugar) — no hay
 * precios sueltos regados por componentes.
 *
 * Las fotos viven en `public/broll-tercos/img/NN.jpg`.
 */

export interface BrollItem {
  /** Ruta a la foto del producto (relativa a /public). */
  img: string;
  name: string;
  /** Categoría en la pastilla roja (eyebrow). */
  tag: string;
  /** Precio en formato corto de vitrina ("$29K"). */
  price: string;
  desc: string;
}

const DOBLE =
  'Doble carne smash 80gr, queso cheddar, pan brioche, cebolla caramelizada, pepinillos, tocineta, salsa americana y BBQ.';
const TRIPLE =
  'Triple carne smash 80gr, queso cheddar, pan brioche, cebolla caramelizada, pepinillos, tocineta, salsa americana y BBQ.';
const MACPAPAS =
  'Doble carne smash 80gr, macarrones con queso, papas fritas, salsa americana, ranch y queso cheddar.';
const MACPOLLO =
  'Macarrones con queso, salsa americana, ranch, pepinillos, tocineta y pollo crispy con miel ahumada.';
const MACMIXTO =
  'Macarrones con queso, salsa americana, ranch, pepinillos, tocineta, pollo crispy con miel ahumada y carne smash 80gr.';
const BURRO =
  'Doble carne smash 80gr, papas fritas, pepinillos, tocineta, salsa ranch, americana, queso cheddar y salsa barbacoa.';
const TENDERS =
  'Tenders de pollo crispy con miel ahumada, papas fritas, salsa ranch y salsa americana.';
const SANDWICH =
  'Pechuga de pollo crispy en miel ahumada, coleslaw, pan brioche y pepinillos.';

const I = (n: string) => `/broll-tercos/img/${n}.jpg`;

export const BROLL_MENU: BrollItem[] = [
  { img: I('12'), name: 'Doble Smash', tag: 'Burgers', price: '$29K', desc: DOBLE },
  { img: I('03'), name: 'Mac & Papas Smash', tag: 'Mac & Papas', price: '$32K', desc: MACPAPAS },
  { img: I('02'), name: 'Triple Smash', tag: 'Burgers', price: '$40K', desc: TRIPLE },
  { img: I('05'), name: 'Burro Smash', tag: 'Burros', price: '$28K', desc: BURRO },
  { img: I('04'), name: 'Tenders Terco', tag: 'Tenders', price: '$25K', desc: TENDERS },
  { img: I('13'), name: 'Doble Smash', tag: 'Burgers', price: '$29K', desc: DOBLE },
  { img: I('10'), name: 'Mac & Cheese Mixto', tag: 'Mac & Cheese', price: '$32K', desc: MACMIXTO },
  { img: I('08'), name: 'Sándwich Pollo', tag: 'Sándwich', price: '$27K', desc: SANDWICH },
  { img: I('06'), name: 'Triple Smash', tag: 'Burgers', price: '$40K', desc: TRIPLE },
  { img: I('07'), name: 'Mac & Cheese Pollo', tag: 'Mac & Cheese', price: '$27K', desc: MACPOLLO },
];

/** Pie de redes — texto plano sobre negro, igual que la señalética. */
export const BROLL_SOCIAL = {
  tiktok: '@somostercos',
  instagram: '@somostercos_',
  whatsapp: '320 761 5261',
  subtag: 'Smash · Burros · Mac & Papas',
} as const;
