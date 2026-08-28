import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { GuideChapter } from '@pos-tercos/domain';

/** Anterior / siguiente, para leer la guía de corrido como un manual. */
export function ChapterPager({
  prev,
  next,
}: {
  prev: GuideChapter | null;
  next: GuideChapter | null;
}) {
  return (
    <nav
      aria-label="Navegación entre capítulos"
      className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2"
    >
      {prev ? (
        <Link
          href={`/guia/${prev.id}`}
          className="group flex flex-col gap-1 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
        >
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Anterior
          </span>
          <span className="font-display text-base font-bold text-foreground">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={`/guia/${next.id}`}
          className="group flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-right transition-colors hover:border-primary/50 hover:bg-muted/40 sm:col-start-2"
        >
          <span className="inline-flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
            Siguiente
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="font-display text-base font-bold text-foreground">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}
