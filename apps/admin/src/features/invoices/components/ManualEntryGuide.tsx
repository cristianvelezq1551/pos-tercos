const MANUAL_STEPS = [
  {
    title: 'Elige el proveedor',
    detail: 'Selecciona uno existente o crea uno nuevo con su NIT.',
  },
  {
    title: 'Carga los items',
    detail: 'Agrega cada línea de la factura y asóciala a un insumo o producto.',
  },
  {
    title: 'Verifica los totales',
    detail: 'El total e IVA deben coincidir con la factura física antes de confirmar.',
  },
] as const;

/** Guía de 3 pasos para el estado inicial de la carga manual (sin foto/IA). */
export function ManualEntryGuide() {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <p className="caps text-[0.6875rem] text-muted-foreground">
        Carga manual · 3 pasos
      </p>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {MANUAL_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{step.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
