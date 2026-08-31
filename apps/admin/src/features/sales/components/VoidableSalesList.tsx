import { paymentMethodLabel, type Sale } from '@pos-tercos/types';
import {
  EmptyState,
  FormField,
  LoadingSkeleton,
  Money,
  StatusBadge,
  cn,
  formatDate,
} from '@pos-tercos/ui';
import { SALE_STATUS_MAPPING } from '../lib/sale-status-mapping';

/** Las ventas del turno que se pueden anular o devolver. */
export function VoidableSalesList({
  sales,
  loading,
  selectedId,
  onSelect,
  nombresDeMedios,
}: {
  sales: Sale[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** `{code: nombre}` del catálogo, para no mostrar "CASH" en pantalla. */
  nombresDeMedios?: Record<string, string>;
}) {
  return (
    <FormField label={`Ventas anulables del turno (${sales.length})`}>
      {loading ? (
        <LoadingSkeleton shape="table-row" count={3} />
      ) : sales.length === 0 ? (
        <EmptyState title="No hay ventas anulables." size="sm" />
      ) : (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {sales.map((s) => (
              <li key={s.id}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors',
                    selectedId === s.id ? 'bg-destructive/10 text-foreground' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="sale"
                      checked={selectedId === s.id}
                      onChange={() => onSelect(s.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="font-semibold">Recibo #{s.receiptNumber}</span>
                      {/* El número ya está arriba: repetirlo gastaba la línea
                              donde el cajero busca la hora y cómo pagó. Y el
                              medio va con su NOMBRE, no con el code ("CASH"). */}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatDate(s.paidAt ?? s.createdAt, 'time-short')}
                        {s.paymentMethod
                          ? ` · ${paymentMethodLabel(s.paymentMethod, nombresDeMedios)}`
                          : ''}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={s.status} mapping={SALE_STATUS_MAPPING} />
                    <Money amount={s.total} weight="semibold" />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FormField>
  );
}
