import type { KitchenProductionRun } from '@pos-tercos/types';
import { EmptyState, formatDate } from '@pos-tercos/ui';
import { Th, Td } from './table-cells';

/** Una fila por TANDA. Los insumos consumidos van dentro de la misma fila:
 *  una tanda escribe N movimientos y verlos sueltos no cuenta la historia. */
export function ProductionsTable({ runs }: { runs: KitchenProductionRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="Sin producción"
        description="No se registraron tandas en este rango."
        size="sm"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>Cuándo</Th>
            <Th>Subproducto</Th>
            <Th align="right">Cantidad</Th>
            <Th>Quién</Th>
            <Th>Consumió</Th>
            <Th>Nota</Th>
            <Th>Foto</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {runs.map((run) => (
            <tr key={run.runId} className="hover:bg-muted/30">
              <Td>
                <time className="text-xs text-muted-foreground" dateTime={run.createdAt}>
                  {formatDate(run.createdAt, 'datetime')}
                </time>
              </Td>
              <Td>
                <span className="font-medium text-foreground">{run.subproductName}</span>
              </Td>
              <Td mono align="right">
                {run.quantityProduced} {run.unit}
              </Td>
              <Td>{run.userName ?? <span className="text-ink-300">sistema</span>}</Td>
              <Td>
                {run.inputs.length === 0 ? (
                  <span className="text-ink-300">—</span>
                ) : (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {run.inputs.map((i) => (
                      <li key={`${i.entityType}:${i.entityId}`}>
                        {i.name}: <span className="tabular-nums">{i.quantity}</span> {i.unit}
                      </li>
                    ))}
                  </ul>
                )}
              </Td>
              <Td>
                {run.notes ? (
                  <span className="text-xs text-ink-600">{run.notes}</span>
                ) : (
                  <span className="text-ink-300">—</span>
                )}
              </Td>
              <Td>
                {run.evidenceUrl ? (
                  <a
                    href={run.evidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver
                  </a>
                ) : (
                  <span className="text-ink-300">sin foto</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
