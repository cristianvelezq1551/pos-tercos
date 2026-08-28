import type { GuideBlock } from '@pos-tercos/domain';
import { GuideCallout } from './GuideCallout';
import { GuideSteps } from './GuideSteps';
import { GuideTable } from './GuideTable';

/**
 * Renderiza un bloque. El switch es exhaustivo a propósito: agregar un tipo al
 * modelo de contenido rompe la compilación acá hasta que se cubra.
 */
export function GuideBlockView({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case 'prose':
      return <p className="text-sm leading-relaxed text-foreground">{block.text}</p>;

    case 'bullets':
      return (
        <ul className="space-y-1.5">
          {block.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      );

    case 'steps':
      return <GuideSteps title={block.title} steps={block.steps} />;

    case 'rule':
      return (
        <GuideCallout kind="rule" title={block.title}>
          {block.text}
        </GuideCallout>
      );

    case 'note':
      return <GuideCallout kind="note">{block.text}</GuideCallout>;

    case 'warn':
      return <GuideCallout kind="warn">{block.text}</GuideCallout>;

    case 'table':
      return <GuideTable head={block.head} rows={block.rows} />;
  }
}
