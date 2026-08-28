import type { TableBlock } from '@pos-tercos/domain';

/**
 * Tabla de la guía. Va dentro de su propio contenedor con scroll horizontal:
 * en teléfono una tabla de tres columnas no cabe y sin esto empuja la página
 * entera de lado.
 */
export function GuideTable({ head, rows }: Pick<TableBlock, 'head' | 'rows'>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.join('|')} className={i > 0 ? 'border-t border-border' : undefined}>
              {row.map((cell, j) => (
                <td
                  key={`${cell}-${j}`}
                  className={`px-3 py-2 align-top leading-relaxed ${
                    j === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
