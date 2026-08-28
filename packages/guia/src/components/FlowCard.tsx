import Link from 'next/link';
import type { GuideFlow } from '@pos-tercos/domain/guia';
import { chapterIcon } from './chapter-icons';

/** Tarjeta de flujo. Enlaza a /guia/flujos/<id> en cualquiera de las dos apps. */
export function FlowCard({ flow }: { flow: GuideFlow }) {
  const Icon = chapterIcon(flow.icon);
  return (
    <Link
      href={`/guia/flujos/${flow.id}`}
      className="group flex min-h-[6.5rem] gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40 active:bg-muted/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-base font-bold leading-tight text-foreground">
          {flow.title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {flow.summary}
        </span>
      </span>
    </Link>
  );
}
