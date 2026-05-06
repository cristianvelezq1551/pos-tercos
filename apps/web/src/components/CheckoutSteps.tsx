import { cn } from '@pos-tercos/ui';
import { Check } from 'lucide-react';

const STEPS = [
  { num: 1, label: 'Datos' },
  { num: 2, label: 'Pago vía WhatsApp' },
  { num: 3, label: 'Confirmación' },
] as const;

export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav
      aria-label="Progreso del pedido"
      className="flex items-center justify-center gap-3 px-6 py-5 sm:gap-5"
    >
      {STEPS.map((step, idx) => {
        const done = current > step.num;
        const active = current === step.num;
        const isLast = idx === STEPS.length - 1;
        return (
          <div key={step.num} className="flex items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  done
                    ? 'bg-primary text-primary-foreground'
                    : active
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-muted-foreground',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : step.num}
              </span>
              <span
                className={cn(
                  'text-xs font-semibold sm:text-sm',
                  active || done ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  'hidden h-0.5 w-12 rounded-full sm:block lg:w-20',
                  done ? 'bg-primary' : 'bg-border',
                )}
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
