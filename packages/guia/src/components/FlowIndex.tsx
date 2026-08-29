import { FLOW_AREA_LABEL, flowsByArea, type Audience } from '@pos-tercos/domain/guia';
import { FlowCard } from './FlowCard';

/**
 * Los flujos agrupados por área. Treinta tarjetas seguidas no se navegan: quien
 * busca "cómo cierro la caja" tiene que poder saltar al bloque de caja de un
 * vistazo, sin leer los de cocina y finanzas por el camino.
 */
export function FlowIndex({ audience, dense = false }: { audience?: Audience; dense?: boolean }) {
  const grupos = flowsByArea(audience);
  return (
    <div className="space-y-8">
      {grupos.map(({ area, flows }) => (
        <section key={area} aria-labelledby={`area-${area}`}>
          <h3
            id={`area-${area}`}
            className="caps text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground"
          >
            {FLOW_AREA_LABEL[area]} · {flows.length}
          </h3>
          <div
            className={
              dense
                ? 'mt-3 space-y-3'
                : 'mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            }
          >
            {flows.map((f) => (
              <FlowCard key={f.id} flow={f} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
