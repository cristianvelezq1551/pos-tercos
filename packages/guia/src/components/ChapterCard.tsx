import Link from 'next/link';
import type { GuideChapter } from '@pos-tercos/domain/guia';
import { chapterIcon } from './chapter-icons';

/** Tarjeta de capítulo del índice general. */
export function ChapterCard({ chapter, index }: { chapter: GuideChapter; index: number }) {
  const Icon = chapterIcon(chapter.icon);
  return (
    <Link
      href={`/guia/${chapter.id}`}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {String(index + 1).padStart(2, '0')}
        </span>
      </span>
      <span className="font-display text-lg font-bold leading-tight text-foreground">
        {chapter.title}
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">{chapter.summary}</span>
      <span className="mt-auto pt-2 text-[0.6875rem] text-muted-foreground">
        {chapter.sections.length} temas
      </span>
    </Link>
  );
}
