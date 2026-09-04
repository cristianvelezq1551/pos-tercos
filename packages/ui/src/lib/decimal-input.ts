/**
 * Lo que se puede TECLEAR en un campo con decimales, y a qué número equivale.
 *
 * Un `<input type="number">` controlado con un número no deja escribir
 * decimales: al teclear "6." el valor se parsea a 6, el componente se vuelve a
 * pintar con "6" y el punto desaparece. Y en un teclado en español el
 * separador es la COMA, que ese input descarta: "6,17" quedaba en 617 — el
 * dueño lo reportó como "solo deja números enteros".
 *
 * Por eso el campo guarda TEXTO mientras se escribe y solo avisa el número.
 */

/**
 * Deja pasar lo que puede llevar a un número: dígitos y UN separador.
 *
 * `maxDecimales` CORTA lo que sobra en vez de redondear al vuelo: redondeando,
 * quien escribe "1,559" con dos decimales ve saltar el campo a "1,56" y no
 * entiende qué pasó. Cortando, el tercer decimal simplemente no entra — el
 * campo no acepta lo que el número no puede representar.
 */
export function normalizarDecimal(texto: string, maxDecimales?: number): string {
  const soloValidos = texto.replace(/[^\d.,]/g, '').replace(/,/g, '.');
  const [entera, ...resto] = soloValidos.split('.');
  if (resto.length === 0) return entera;
  // Un segundo punto no borra lo tecleado: se ignora y lo demás se conserva.
  const decimales = resto.join('');
  const cortados = maxDecimales === undefined ? decimales : decimales.slice(0, maxDecimales);
  return `${entera}.${cortados}`;
}

/** El número que representa el texto. "" y "6." valen 0 y 6: mientras se
 *  escribe hay estados a medias que no deben romper el total de la línea. */
export function decimalANumero(texto: string): number {
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/** ¿El texto ya escrito representa este número? Sirve para no pisar lo que la
 *  persona está tecleando cuando el valor llega recalculado desde afuera:
 *  "6." y "6" son el mismo 6, y reemplazarlo le borraría el punto. */
export function textoRepresenta(texto: string, valor: number | null): boolean {
  if (valor === null) return texto === '';
  return decimalANumero(texto) === valor;
}

/** Cómo se muestra un valor que viene de afuera. `null` y 0 se muestran
 *  vacíos: es el valor con el que nace una fila y, si se pinta, hay que
 *  borrarlo antes de escribir — así quedaba "06.17". */
export function textoDeDecimal(valor: number | null): string {
  return valor === null || valor === 0 ? '' : String(valor);
}
