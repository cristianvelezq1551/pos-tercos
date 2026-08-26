import type { PurchaseSuggestion } from '@pos-tercos/types';
import { computeSuggestedPurchase } from '@pos-tercos/domain';
import { Quantity } from '@pos-tercos/ui';

/**
 * Explica, con las unidades a la vista, por qué se sugiere esa cantidad:
 * cuánto hay, cuánto falta para el mínimo, y en qué queda el inventario
 * después de comprar.
 *
 * Sin esto la pantalla decía "2.500,0 / 3.000,0 → 4 kg" y quien compra tenía
 * que adivinar de qué eran esos números y si 4 kg alcanzaban.
 *
 * Usa el MISMO cálculo del servidor (`computeSuggestedPurchase` en domain)
 * para que la explicación no pueda contradecir a la sugerencia guardada.
 */
export function CoverageExplainer({
  suggestion,
  /** Cantidad que quien compra escribió a mano; si no, la sugerida. */
  quantityOverride,
}: {
  suggestion: PurchaseSuggestion;
  quantityOverride?: number;
}) {
  const { unitStock, unitPurchase, conversionFactor, currentStock, thresholdMin } = suggestion;
  const base = computeSuggestedPurchase({
    currentStock,
    thresholdMin,
    conversionFactor,
  });

  const qty =
    quantityOverride !== undefined && quantityOverride > 0
      ? quantityOverride
      : suggestion.suggestedQty;
  const coverage = qty * conversionFactor;
  const resulting = currentStock + coverage;
  const alcanza = resulting >= thresholdMin;
  const sobra = resulting - thresholdMin;

  // Cuando comprar y contar usan la misma unidad, "1 paquete (1 unidad)" es
  // ruido: se omite la equivalencia.
  const mismaUnidad = conversionFactor === 1 && unitPurchase === unitStock;

  // Las existencias son una FOTO del momento en que se detectó, no el stock
  // vivo: entre medias se vendió y se produjo. Decir "hoy tienes" sobre un
  // dato de hace horas hace que quien compra calcule sobre algo que ya cambió.
  const detectadaEl = new Date(suggestion.createdAt);
  const horas = Math.floor((Date.now() - detectadaEl.getTime()) / 3_600_000);
  const vieja = horas >= 6;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
      <p className="text-foreground">
        Al detectarla había{' '}
        <Quantity value={currentStock} unit={unitStock} maxDecimals={2} className="font-semibold" />
        {currentStock < 0 ? ' (estabas debiendo)' : ''} y el mínimo es{' '}
        <Quantity value={thresholdMin} unit={unitStock} maxDecimals={2} className="font-semibold" />.
      </p>
      <p className="text-foreground">
        {base.deficitStock > 0 ? (
          <>
            Faltan{' '}
            <Quantity
              value={base.deficitStock}
              unit={unitStock}
              maxDecimals={2}
              className="font-semibold text-destructive"
            />{' '}
            para llegar al mínimo.
          </>
        ) : (
          <>Ya estás en el mínimo.</>
        )}
      </p>
      {!mismaUnidad ? (
        <p className="text-xs text-muted-foreground">
          Se compra por {unitPurchase}, y cada {unitPurchase} trae{' '}
          <Quantity value={conversionFactor} unit={unitStock} maxDecimals={2} className="text-current" />.
        </p>
      ) : null}
      <p className={alcanza ? 'text-foreground' : 'text-destructive'}>
        Comprando <Quantity value={qty} unit={unitPurchase} maxDecimals={2} className="font-semibold" />
        {!mismaUnidad ? (
          <>
            {' '}
            (<Quantity value={coverage} unit={unitStock} maxDecimals={2} className="text-current" />)
          </>
        ) : null}{' '}
        quedas en{' '}
        <Quantity value={resulting} unit={unitStock} maxDecimals={2} className="font-semibold" />
        {alcanza ? (
          sobra > 0 ? (
            <>
              : cubre el mínimo y sobran{' '}
              <Quantity value={sobra} unit={unitStock} maxDecimals={2} className="text-current" />.
            </>
          ) : (
            <>: justo el mínimo.</>
          )
        ) : (
          <>
            : sigue por debajo del mínimo. Necesitas al menos{' '}
            <Quantity value={base.suggestedQty} unit={unitPurchase} maxDecimals={2} className="font-semibold" />.
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        Existencias tomadas el {detectadaEl.toLocaleString('es-CO')}.
        {vieja
          ? ' Ya pasaron horas: revisa el inventario antes de decidir la cantidad.'
          : ''}
      </p>
    </div>
  );
}
