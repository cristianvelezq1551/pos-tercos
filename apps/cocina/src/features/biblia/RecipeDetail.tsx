'use client';

import type { RecipeBookEntry, RecipeComponent } from '@pos-tercos/types';
import { Dialog, pluralizeUnit } from '@pos-tercos/ui';
import { useState } from 'react';
import { fotosDeReceta } from './foto-de-receta';
import { VisorDeFoto } from './VisorDeFoto';

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
  const [ampliada, setAmpliada] = useState<{ url: string; label?: string | null } | null>(null);
  if (!entry) return null;
  const fotos = fotosDeReceta(entry);
  // El API puede no mandarlo todavía (ventana de despliegue): sin variantes se
  // ve como siempre, nunca roto.
  const variantes = entry.variants ?? [];
  return (
    <Dialog open={open} onClose={onClose} title={entry.name} maxWidth="max-w-lg">
      <div className="space-y-5">
        {/* Las fotos de la PREPARACIÓN son las que sirven para armar el
            plato —una por variante— y la de la carta queda de respaldo cuando
            nadie subió ninguna propia.

            Con varias van en una tira que se desliza: apiladas empujaban la
            receta y el paso a paso fuera de la pantalla, y son justo lo que el
            cocinero abrió a ver. De paso quedan lado a lado, que es como se
            comparan dos variantes.

            El rótulo va SOBRE la foto: leerlo abajo obliga a ir y volver con
            la vista para saber cuál es cuál. */}
        {fotos.length > 0 ? (
          <ul
            className={
              fotos.length === 1
                ? 'space-y-2'
                : '-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1'
            }
          >
            {fotos.map((foto) => (
              <li
                key={foto.url}
                className={fotos.length === 1 ? 'relative' : 'relative w-[78%] shrink-0 snap-start'}
              >
                {/* Varias fotos traen el despiece con el gramaje en letra
                    diminuta: a este tamaño no se lee. Un toque la abre grande. */}
                <button
                  type="button"
                  onClick={() => setAmpliada({ url: foto.url, label: foto.label })}
                  aria-label={`Ver en grande${foto.label ? ` la variante ${foto.label}` : ''}`}
                  className="block w-full"
                >
                  <img
                    src={foto.url}
                    alt={foto.label ? `${entry.name} — ${foto.label}` : `Así se ve ${entry.name}`}
                    className={`w-full rounded-lg border border-border object-cover ${
                      fotos.length === 1 ? 'max-h-56' : 'h-40'
                    }`}
                    loading="lazy"
                  />
                </button>
                {foto.label ? (
                  <span className="absolute left-2 top-2 rounded-md bg-ink-950/80 px-2 py-1 text-xs font-semibold text-foreground">
                    {foto.label}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
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
        ) : entry.components.length > 0 || variantes.length > 0 ? (
          <>
            {entry.components.length > 0 ? (
              <Section title={variantes.length > 0 ? 'Lleva siempre' : 'Lleva'}>
                <Items items={entry.components} />
              </Section>
            ) : null}
            {/* Cada variante SUMA lo suyo encima de la base. Sin esto, la ficha
                de un plato con variantes mostraba las papas y las salsas y
                ninguna de las tres proteínas: la receta de algo que nadie pide. */}
            {variantes.map((v) => (
              <Section key={v.sizeId} title={`Además, si es ${v.name}`}>
                <Items items={v.components} />
              </Section>
            ))}
          </>
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
      <VisorDeFoto
        url={ampliada?.url ?? null}
        label={ampliada?.label}
        alt={`Así se ve ${entry.name}`}
        onClose={() => setAmpliada(null)}
      />
    </Dialog>
  );
}

function Items({ items }: { items: RecipeComponent[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((c) => (
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
