import type { GuideStep } from '../content';

/**
 * Pasos numerados. El "porqué" va bajo el paso, en tono secundario: se puede
 * saltar cuando ya sabes hacerlo y está ahí cuando algo no cuadra.
 */
export function GuideSteps({ title, steps }: { title?: string; steps: readonly GuideStep[] }) {
  return (
    <div className="space-y-3">
      {title ? (
        <p className="caps text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground">
          {title}
        </p>
      ) : null}
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={step.do} className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary"
            >
              {i + 1}
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm leading-relaxed text-foreground">{step.do}</p>
              {step.why ? (
                <p className="border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
                  {step.why}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
