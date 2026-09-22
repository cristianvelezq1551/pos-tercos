import { Paperclip } from 'lucide-react';

/**
 * Marca de "este pago tiene comprobante". Es un icono y no la palabra
 * "Comprobante" porque en una tarjeta de ~270 px esa etiqueta se llevaba un
 * tercio de la fila y dejaba el período y la fecha truncados a una letra: el
 * dato que importa es CUÁNTO y A QUIÉN, y el comprobante solo necesita
 * confirmarse de un vistazo.
 *
 * El conteo solo se escribe cuando hay más de uno (un "1" al lado del clip no
 * agrega nada). El texto completo va en `title` y en el nombre accesible.
 */
export function ProofMark({ count }: { count: number }) {
  if (count <= 0) return null;
  const texto = count > 1 ? `${count} comprobantes` : 'Tiene comprobante';
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground"
      title={texto}
      aria-label={texto}
    >
      <Paperclip className="h-3 w-3" strokeWidth={2} aria-hidden />
      {count > 1 ? count : null}
    </span>
  );
}
