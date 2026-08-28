import Link from 'next/link';
import { chaptersFor, chapterIcon, FlowCard, flowsFor } from '@pos-tercos/guia';
import { GuiaAsistentePanel } from '../../../features/guia';

export const metadata = { title: 'Guía · Cocina Tercos' };

/**
 * Índice de la guía del cocinero. NO muestra los 12 capítulos del admin: pide
 * los temas marcados para cocina (10 de 80). Enseñarle finanzas para que
 * encuentre "cómo registro una merma" es ruido, y el ruido hace que no la abra.
 */
export default function GuiaCocinaPage() {
  const chapters = chaptersFor('cocina');
  const flujos = flowsFor('cocina');
  const total = chapters.reduce((n, c) => n + c.sections.length, 0) + flujos.length;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">Guía</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cómo se hace cada cosa, paso a paso. {total} temas.
      </p>

      <div className="mt-5">
        <GuiaAsistentePanel />
      </div>

      <h2 className="mt-8 font-display text-lg font-bold text-foreground">Paso a paso</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Cómo se hace cada cosa y dónde se ve después.
      </p>
      <ul className="mt-3 space-y-3">
        {flujos.map((f) => (
          <li key={f.id}>
            <FlowCard flow={f} />
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-display text-lg font-bold text-foreground">Entender el sistema</h2>
      <ul className="mt-3 space-y-3">
        {chapters.map((c) => {
          const Icon = chapterIcon(c.icon);
          return (
            <li key={c.id}>
              <Link
                href={`/guia/${c.id}`}
                className="flex min-h-[4.5rem] items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors active:bg-muted/60"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg font-bold leading-tight text-foreground">
                    {c.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {c.sections.length} {c.sections.length === 1 ? 'tema' : 'temas'}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
