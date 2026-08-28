/** Renglón del estado de resultados: etiqueta a la izquierda, monto a la
 *  derecha en tabulares. Lo comparten el cuerpo del P&G y sus líneas de
 *  pérdida — duplicarlo haría que se separaran al primer retoque de estilo. */
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
    <div className="flex justify-between gap-2">
      <span className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
      <span
        className={`tabular-nums ${
          strong ? 'font-bold text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
