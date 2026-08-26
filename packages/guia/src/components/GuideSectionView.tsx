import { MapPin } from 'lucide-react';
import type { GuideSection } from '../content';
import { AudienceBadges } from './AudienceBadges';
import { GuideBlockView } from './GuideBlockView';

/**
 * Una sección de la guía. El id es el ancla de la URL (/guia/<cap>#<id>): el
 * buscador y el índice lateral enlazan acá, así que NO cambiar los ids sin
 * saber que se rompen los enlaces que la gente haya guardado.
 */
export function GuideSectionView({ section }: { section: GuideSection }) {
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="scroll-mt-24 border-t border-border pt-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={`${section.id}-title`}
          className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl"
        >
          {section.title}
        </h2>
        <AudienceBadges audience={section.audience} />
      </div>

      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{section.summary}</p>

      {section.where ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>{section.where}</span>
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {section.blocks.map((block, i) => (
          <GuideBlockView key={`${section.id}-${i}`} block={block} />
        ))}
      </div>
    </section>
  );
}
