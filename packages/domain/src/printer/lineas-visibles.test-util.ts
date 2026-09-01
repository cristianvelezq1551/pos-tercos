/**
 * Las líneas que la impresora IMPRIME, sin los bytes de control.
 *
 * Medir el largo contando los bytes crudos no sirve: una secuencia como
 * `ESC a 0` (alinear a la izquierda) lleva una `a` que es ASCII imprimible y se
 * cuela en la cuenta. Este ayudante quita las secuencias completas antes de
 * medir, que es lo que hace falta para afirmar "ninguna línea pasa de 32".
 *
 * No se exporta desde el barril: es solo para las pruebas (todo lo que cuelga
 * del barril de `domain` viaja al bundle de las cinco apps).
 */
export function lineasVisibles(papel: string): string[] {
  const ESC = String.fromCharCode(0x1b);
  const GS = String.fromCharCode(0x1d);
  const sinControl = papel
    // ESC @ (init) · ESC a n (alineación) · ESC E n (negrita)
    .split(ESC + '@')
    .join('')
    .replace(new RegExp(ESC + '[aE][\\s\\S]', 'g'), '')
    // GS ! n (tamaño) · GS V n (corte)
    .replace(new RegExp(GS + '[!V][\\s\\S]', 'g'), '');
  return sinControl
    .split('\n')
    .map((l) => [...l].filter((c) => c.charCodeAt(0) >= 0x20).join(''))
    .filter((l) => l.length > 0);
}
