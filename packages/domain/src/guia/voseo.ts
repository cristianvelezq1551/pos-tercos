/**
 * Detecta voseo rioplatense en un texto.
 *
 * La regla de copy del repo es español neutro con TUTEO. El asistente de IA es
 * la única superficie donde el texto no lo escribimos nosotros, así que hace
 * falta poder verificarlo: en una prueba respondió "escribís, marcás, elegís,
 * guardás".
 *
 * Detectar por terminación NO alcanza, por dos motivos distintos:
 *
 * 1. Sustantivos y adverbios acaban igual: "más", "después", "país", "interés".
 * 2. El FUTURO en tuteo también acaba en -ás: "marcarás", "podrás", "tendrás".
 *    Son correctos y hay que dejarlos pasar.
 *
 * Lo que de verdad separa las dos formas es la raíz: el futuro conserva el
 * infinitivo completo antes de la tilde (marcar+ás), mientras el voseo lo
 * recorta (marc+ás). Sobre esa diferencia se decide.
 */

/** Palabras que acaban como un voseo sin serlo. */
const EXCEPCIONES = new Set([
  // Sustantivos, adverbios y adjetivos.
  'mas', 'más', 'despues', 'después', 'ingles', 'inglés', 'pais', 'país', 'quizas', 'quizás',
  'jamas', 'jamás', 'ademas', 'además', 'atras', 'atrás', 'detras', 'detrás', 'compas', 'compás',
  'interes', 'interés', 'frances', 'francés', 'reves', 'revés', 'tambien', 'también', 'asi', 'así',
  'anis', 'anís', 'maiz', 'maíz', 'raiz', 'raíz', 'sarten', 'sartén', 'almacen', 'almacén',
  'menu', 'menús', 'menus', 'jesus', 'jesús', 'analisis', 'análisis', 'crisis',
  // Formas IRREGULARES del tuteo que no conservan infinitivo.
  'estás', 'estas', 'estés', 'estes',
]);

const TERMINACIONES = ['ás', 'és', 'ís'] as const;
const INFINITIVOS = /(ar|er|ir)$/;

/**
 * Raíces del futuro IRREGULAR, que no conservan el infinitivo: "podrás" viene
 * de "poder", no de "poder+ás". Es un conjunto cerrado en español, así que
 * listarlo es exacto y no deja falsos positivos como haría la regla "termina
 * en r" (que además dejaría pasar "entrás", voseo de entrar).
 */
const FUTURO_IRREGULAR = new Set([
  'podr', 'tendr', 'pondr', 'saldr', 'vendr', 'har', 'dir', 'querr',
  'sabr', 'cabr', 'valdr', 'habr',
]);

function esVoseo(palabra: string): boolean {
  if (palabra.length < 5 || EXCEPCIONES.has(palabra)) return false;
  for (const fin of TERMINACIONES) {
    if (!palabra.endsWith(fin)) continue;
    const raiz = palabra.slice(0, -fin.length);
    // "marcarás" → raíz "marcar": futuro regular, correcto.
    // "podrás"   → raíz "podr":   futuro irregular, correcto.
    // "marcás"   → raíz "marc":   ni lo uno ni lo otro → voseo.
    return !INFINITIVOS.test(raiz) && !FUTURO_IRREGULAR.has(raiz);
  }
  return false;
}

export function tieneVoseo(texto: string): boolean {
  return palabrasVoseo(texto).length > 0;
}

/** Las palabras concretas que se leyeron como voseo. Útil en el mensaje del test. */
export function palabrasVoseo(texto: string): string[] {
  const encontradas = texto
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(esVoseo);
  return [...new Set(encontradas)];
}
