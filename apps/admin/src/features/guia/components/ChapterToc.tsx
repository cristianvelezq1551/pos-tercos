import Link from 'next/link';
import type { GuideChapter } from '../content';

/** Índice del capítulo. En pantallas grandes queda fijo al costado. */
export function ChapterToc({ chapter }: { chapter: GuideChapter }) {
  return (
    <nav aria-label="Contenido del capítulo" className="sticky top-6">
      <p className="caps text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground">
        En este capítulo
      </p>
      <ul className="mt-3 space-y-1 border-l border-border">
        {chapter.sections.map((s) => (
          <li key={s.id}>
            <Link
              href={`/guia/${chapter.id}#${s.id}`}
              className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-sm leading-snug text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {s.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
