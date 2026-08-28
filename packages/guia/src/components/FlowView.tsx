import { CircleCheck } from 'lucide-react';
import type { GuideFlow } from '@pos-tercos/domain';
import { AudienceBadges } from './AudienceBadges';
import { FlowQuestions } from './FlowQuestions';
import { FlowSightings } from './FlowSightings';
import { GuideBlockView } from './GuideBlockView';
import { GuideSteps } from './GuideSteps';
import { HashScroller } from './HashScroller';

function Bloque({
  id,
  titulo,
  sub,
  children,
}: {
  id: string;
  titulo: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-7">
      <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {titulo}
      </h2>
      {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Un flujo completo: cuándo, qué necesitas, cómo, dónde se ve y qué preguntar. */
export function FlowView({ flow }: { flow: GuideFlow }) {
  return (
    <div className="min-w-0">
      <HashScroller />

      <div className="flex flex-wrap items-center gap-2">
        <AudienceBadges audience={flow.audience} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground">{flow.summary}</p>

      <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <p className="caps text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground">
          Cuándo se hace
        </p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{flow.when}</p>
      </div>

      <div className="mt-8 space-y-8">
        {flow.before.length > 0 ? (
          <Bloque id="antes" titulo="Antes de empezar">
            <ul className="space-y-2">
              {flow.before.map((b) => (
                <li key={b} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                  <CircleCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="min-w-0">{b}</span>
                </li>
              ))}
            </ul>
          </Bloque>
        ) : null}

        <Bloque id="pasos" titulo="Paso a paso">
          <GuideSteps steps={flow.steps} />
        </Bloque>

        <Bloque
          id="donde-se-ve"
          titulo="Dónde se ve el resultado"
          sub="Lo que registras aquí aparece en varios lugares, y no siempre con el mismo número. Esto explica cada uno."
        >
          <FlowSightings sightings={flow.sightings} />
        </Bloque>

        {flow.pitfalls.length > 0 ? (
          <Bloque id="cuidado" titulo="Lo que sale mal">
            <div className="space-y-4">
              {flow.pitfalls.map((b, i) => (
                <GuideBlockView key={`${flow.id}-p-${i}`} block={b} />
              ))}
            </div>
          </Bloque>
        ) : null}

        {flow.questions.length > 0 ? (
          <Bloque id="preguntas" titulo="Preguntas concretas">
            <FlowQuestions questions={flow.questions} />
          </Bloque>
        ) : null}
      </div>
    </div>
  );
}
