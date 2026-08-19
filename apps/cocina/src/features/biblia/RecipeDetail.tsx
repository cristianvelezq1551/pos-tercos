'use client';

import type { RecipeBookEntry } from '@pos-tercos/types';
import { Dialog, pluralizeUnit } from '@pos-tercos/ui';

/** Detalle de una receta: composición (qué lleva) + paso a paso. */
export function RecipeDetail({
  entry,
  open,
  onClose,
}: {
  entry: RecipeBookEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!entry) return null;
  return (
    <Dialog open={open} onClose={onClose} title={entry.name} maxWidth="max-w-lg">
      <div className="space-y-5">
        {entry.kind === 'SUBPRODUCT' && entry.yield ? (
          <p className="text-xs text-muted-foreground">
            Rinde <b className="text-foreground">{fmt(entry.yield)}</b>{' '}
            {pluralizeUnit(entry.unit, entry.yield)} por tanda
          </p>
        ) : null}
        {entry.description ? <p className="text-sm text-muted-foreground">{entry.description}</p> : null}

        {/* Composición */}
        {entry.isCombo ? (
          <Section title="Incluye">
            <ul className="space-y-1 text-sm">
              {entry.comboItems.map((c) => (
                <li key={c.productId} className="flex justify-between gap-2">
                  <span className="text-foreground">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">×{c.quantity}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : entry.components.length > 0 ? (
          <Section title="Lleva">
            <ul className="space-y-1 text-sm">
              {entry.components.map((c) => (
                <li key={`${c.type}-${c.id}`} className="flex items-baseline justify-between gap-2">
                  <span className="text-foreground">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {fmt(c.quantity)} {pluralizeUnit(c.unit, c.quantity)}
                    {c.mermaPct > 0 ? (
                      <span className="ml-1 text-[0.625rem] text-warning">
                        +{Math.round(c.mermaPct * 100)}% merma
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Paso a paso */}
        <Section title="Preparación">
          {entry.preparationSteps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin pasos cargados todavía.</p>
          ) : (
            <ol className="space-y-2">
              {entry.preparationSteps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-foreground">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="caps mb-2 text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
