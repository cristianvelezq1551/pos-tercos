const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function day(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function time(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'pm' : 'am'}`;
}

/**
 * Ventana del turno en una línea: "27 jul · 6:47 pm → 7:56 pm". Si cruzó de
 * día repite la fecha del cierre. El formato largo (`27 de jul de 2026,
 * 06:47 p. m.`) parte la columna en cuatro renglones y vuelve ilegible la fila.
 */
export function formatShiftWindow(openedAt: string, closedAt: string | null): string {
  const o = new Date(openedAt);
  if (!closedAt) return `${day(o)} · ${time(o)} → sin cerrar`;
  const c = new Date(closedAt);
  const sameDay =
    o.getFullYear() === c.getFullYear() &&
    o.getMonth() === c.getMonth() &&
    o.getDate() === c.getDate();
  return sameDay
    ? `${day(o)} · ${time(o)} → ${time(c)}`
    : `${day(o)} ${time(o)} → ${day(c)} ${time(c)}`;
}
