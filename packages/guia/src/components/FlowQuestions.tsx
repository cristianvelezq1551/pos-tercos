import type { FlowQuestion } from '@pos-tercos/domain/guia';

/**
 * Preguntas con nombre propio ("se me quemó una tanda"), no genéricas. Van
 * abiertas y no en acordeón: quien llega acá está buscando, y un acordeón
 * obliga a abrir de a una para descubrir cuál era la suya.
 */
export function FlowQuestions({ questions }: { questions: readonly FlowQuestion[] }) {
  return (
    <dl className="space-y-4">
      {questions.map((qa) => (
        <div key={qa.q} className="rounded-lg border border-border bg-muted/30 p-4">
          <dt className="font-semibold leading-snug text-foreground">{qa.q}</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{qa.a}</dd>
        </div>
      ))}
    </dl>
  );
}
