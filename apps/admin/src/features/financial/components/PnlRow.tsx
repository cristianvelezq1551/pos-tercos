/** Renglón del estado de resultados: etiqueta a la izquierda, monto a la
 *  derecha en tabulares. Lo comparten el cuerpo del P&G y sus líneas de
 *  pérdida — duplicarlo haría que se separaran al primer retoque de estilo.
 *
 *  En celular la etiqueta TIENE que poder ocupar dos renglones: sin `min-w-0`
 *  el ancho mínimo de la fila es etiqueta + monto en una sola línea, y con eso
 *  la tarjeta crecía a 502 px dentro de una pantalla de 390 — los montos
 *  quedaban cortados por el borde derecho. La etiqueta se parte; el monto,
 *  nunca (un precio partido a la mitad no se puede leer). */
export function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`min-w-0 ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>
        {label}
      </span>
      <span
        className={`shrink-0 whitespace-nowrap text-right tabular-nums ${
          strong ? 'font-bold text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
