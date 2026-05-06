import { cn } from '@pos-tercos/ui';

const STEPS = [
  { key: 'received', label: 'Recibido' },
  { key: 'cooking', label: 'Preparando' },
  { key: 'ready', label: 'Listo' },
] as const;

export function StatusTimeline({ active }: { active: 0 | 1 | 2 | 3 }) {
  return (
    <ol
      aria-label="Progreso del pedido"
      className="flex w-full max-w-[420px] items-center justify-center gap-3"
    >
      {STEPS.map((step, idx) => {
        const stepNum = idx + 1;
        const reached = active >= stepNum;
        const isLast = idx === STEPS.length - 1;
        return (
          <li key={step.key} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'block rounded-full transition-colors',
                  reached ? 'h-3 w-3 bg-[#16A34A]' : 'h-2.5 w-2.5 border border-border bg-card',
                )}
              />
              <span
                className={cn(
                  'text-xs font-semibold transition-colors sm:text-sm',
                  reached ? 'text-[#16A34A]' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  'h-0.5 w-10 rounded-full sm:w-12',
                  active > stepNum ? 'bg-[#16A34A]' : 'bg-border',
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
