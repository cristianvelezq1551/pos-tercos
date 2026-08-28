import { Clock, Eye } from 'lucide-react';
import type { FlowSighting } from '@pos-tercos/domain/guia';

/**
 * "Dónde se ve" — la parte que faltaba en la guía vieja.
 *
 * Cada tarjeta es un lugar de la app, qué aparece ahí y qué significa cuando el
 * número engaña. Sin esto, alguien registra una merma y no tiene idea de en qué
 * seis pantallas repercute ni por qué el valor no es el mismo en todas.
 */
export function FlowSightings({ sightings }: { sightings: readonly FlowSighting[] }) {
  return (
    <ol className="space-y-3">
      {sightings.map((s) => (
        <li
          key={s.where}
          className="rounded-lg border border-border bg-card p-4"
        >
          <p className="flex items-start gap-2 font-semibold text-foreground">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
            <span className="min-w-0">{s.where}</span>
          </p>
          <p className="mt-1.5 pl-6 text-sm leading-relaxed text-foreground">{s.what}</p>
          {s.means ? (
            <p className="mt-2 ml-6 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
              {s.means}
            </p>
          ) : null}
          {s.delay ? (
            <p className="mt-2 flex items-center gap-1.5 pl-6 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              {s.delay}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
