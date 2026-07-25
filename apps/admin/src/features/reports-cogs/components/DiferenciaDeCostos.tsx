import { formatCop } from '../../../lib/format';
import type { FilaDeMargen } from '../lib/comparar-costos';

/**
 * La confusión no nace de los números sino de que viven en pantallas distintas
 * y se comparan de memoria. Acá se dice, en una frase por producto, por qué los
 * dos son correctos y qué va a pasar cuando se acabe el lote viejo.
 */
export function DiferenciaDeCostos({ filas }: { filas: FilaDeMargen[] }) {
  const conDiferencia = filas.filter(
    (f) => f.difiere && f.refUnitario !== null && f.realUnitario !== null,
  );
  if (conDiferencia.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border bg-warning/5 px-4 py-3">
      <p className="text-xs font-semibold text-warning">
        Por qué el costo real no coincide con el costo de hoy
      </p>
      <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        {conDiferencia.map(({ producto, refUnitario, realUnitario }) => (
          <li key={producto.productId}>
            <strong className="text-foreground">{producto.productName}</strong>: vendiste a{' '}
            <strong className="text-foreground">{formatCop(realUnitario!)}</strong> cada uno porque
            saliste del lote que ya tenías, y hacerlo hoy te costaría{' '}
            <strong className="text-foreground">{formatCop(refUnitario!)}</strong>.{' '}
            {refUnitario! > realUnitario! ? (
              <>
                Cuando se acabe ese lote tu costo real <strong className="text-warning">sube</strong>{' '}
                y el margen baja: revisa el precio de venta con el número de la derecha, no con el
                de la izquierda.
              </>
            ) : (
              <>
                Conseguiste el insumo más barato que antes: cuando se acabe el lote viejo tu costo
                real <strong className="text-success">baja</strong> y el margen mejora.
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
