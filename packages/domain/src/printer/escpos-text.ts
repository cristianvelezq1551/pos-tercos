/**
 * Helpers de texto de los tickets térmicos (58/80 mm, ancho fijo en caracteres).
 *
 * Viven aparte porque el recibo y la comanda los necesitan a los dos y estaban
 * copiados en cada archivo: la copia de `truncate` ya existía en ambos y `wrap`
 * solo en uno, así que el recibo no sabía partir un texto largo.
 */

/**
 * Corta con un PUNTO, no con "…": los papeles se codifican en latin1 y "…"
 * (U+2026) no existe ahí — `Buffer.from(s, 'latin1')` escribe su byte bajo,
 * 0x26, y la impresora imprimía "&" ("Papas TERCOS Pollo y Miel ah&").
 * Lo que la cocina tiene que leer entero NO pasa por acá: va por `wrap`.
 */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '.';
}

/**
 * Parte el texto en líneas de `max` chars sin cortar palabras. Hay textos que
 * NO se pueden truncar: "Cra 43A #5-15, torre 2, apto 502" recortado a 32
 * pierde justo el apartamento, que es lo único que el repartidor necesita al
 * final; y el motivo de una cortesía es el respaldo de por qué salió sin
 * cobrarse. Una palabra más larga que el ancho (una URL, un pegote sin
 * espacios) se corta a la fuerza — es eso o descartarla.
 */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= max) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
    while (line.length > max) {
      lines.push(line.slice(0, max));
      line = line.slice(max);
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * `wrap` con un prefijo en la primera línea ("2x ", "   + ") y, en las
 * siguientes, una sangría del mismo ancho: la continuación se lee como parte
 * del mismo ítem y no como uno nuevo. Si el texto cabe, sale exactamente
 * `prefix + text` — el papel de siempre, byte por byte.
 */
export function wrapWithPrefix(prefix: string, text: string, max: number): string[] {
  const indent = ' '.repeat(prefix.length);
  const lineas = wrap(text, Math.max(1, max - prefix.length));
  if (lineas.length === 0) return [prefix.trimEnd()];
  return lineas.map((linea, i) => (i === 0 ? prefix : indent) + linea);
}

/**
 * Pega `left` y `right` con espacios en el medio para llenar `width`.
 * Si juntos pasan width, deja un espacio mínimo.
 */
export function twoCol(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
}
