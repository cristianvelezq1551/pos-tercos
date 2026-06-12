/** Medianoche local de HOY en ISO — filtro estándar de "lo del día". */
export function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
