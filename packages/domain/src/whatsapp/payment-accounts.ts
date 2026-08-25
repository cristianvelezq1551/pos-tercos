/**
 * Bloque "a dónde pagar" que se pega en el mensaje de WhatsApp y en la pantalla
 * de seguimiento del pedido. Puro: el dato viene de la config del negocio.
 *
 * La forma importa más de lo que parece. El número va SOLO en su línea, sin
 * rótulo pegado ni signos alrededor: así el cliente lo toca dos veces y lo
 * copia entero. Escrito dentro de una frase ("Nequi: 3046706847") hay que
 * arrastrar la selección con el dedo sobre la pantalla, y ahí es donde se
 * pierde o se repite un dígito — y un comprobante a una cuenta equivocada es
 * un problema mucho más caro que una línea de más en el mensaje.
 *
 * Por lo mismo NO lleva negrita: los asteriscos de WhatsApp se cuelan en el
 * portapapeles de algunos clientes.
 */

export interface PaymentAccountLine {
  /** "Nequi", "Bancolombia ahorros". */
  label: string;
  /** El número, solo. */
  value: string;
  /** "a nombre de Tercos S.A.S." — opcional. */
  note?: string | null;
}

/** null si no hay ninguna cuenta cargada — el caller decide qué decir entonces. */
export function buildPaymentAccountsText(accounts: PaymentAccountLine[]): string | null {
  const bloques = accounts
    .map((a) => {
      const label = a.label.trim();
      const value = a.value.trim();
      if (!value) return null;
      const note = a.note?.trim();
      return [label, value, note].filter(Boolean).join('\n');
    })
    .filter((b): b is string => b !== null);

  // Línea en blanco entre cuentas: sin ella, dos números seguidos se leen como
  // uno solo de doble largo.
  return bloques.length ? bloques.join('\n\n') : null;
}
