'use client';

import { Input, Label, MoneyInput, formatCop } from '@pos-tercos/ui';

interface InvoiceMetaSectionProps {
  invoiceNumber: string;
  onInvoiceNumberChange: (v: string) => void;
  total: string;
  onTotalChange: (v: string) => void;
  iva: string;
  onIvaChange: (v: string) => void;
  freight: string;
  onFreightChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  computedItemsTotal: number;
  disabled?: boolean;
}

/** Margen con el que la conciliación se da por cuadrada (espeja la tolerancia
 *  del backend en su piso: `max(1% del total, $1.000)`). Mostrar "cuadra" con
 *  un peso de diferencia sería ruido; mostrar error donde el backend acepta,
 *  peor: el operador no podría avanzar sin entender por qué. */
const TOLERANCIA_COP = 1000;

export function InvoiceMetaSection({
  invoiceNumber,
  onInvoiceNumberChange,
  total,
  onTotalChange,
  iva,
  onIvaChange,
  freight,
  onFreightChange,
  notes,
  onNotesChange,
  computedItemsTotal,
  disabled,
}: InvoiceMetaSectionProps) {
  const totalNum = Number(total) || 0;
  const freightNum = Number(freight) || 0;
  const mercancia = totalNum - freightNum;
  const diferencia = mercancia - computedItemsTotal;
  const cuadra = Math.abs(diferencia) <= Math.max(totalNum * 0.01, TOLERANCIA_COP);
  const freightMayorQueTotal = freightNum > totalNum && total !== '';

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <header><h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Datos de la factura</h3></header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="invoiceNumber">Número</Label>
          <Input id="invoiceNumber" disabled={disabled} value={invoiceNumber} onChange={(e) => onInvoiceNumberChange(e.target.value)} placeholder="F-12345" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="total">Total (COP)</Label>
          <MoneyInput id="total" required disabled={disabled} value={total} onChange={onTotalChange} />
          <p className="text-xs text-muted-foreground">Lo que pagas en total, domicilio incluido.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="freight">Domicilio o flete (COP)</Label>
          <MoneyInput id="freight" disabled={disabled} value={freight} onChange={onFreightChange} placeholder="0" />
          <p className="text-xs text-muted-foreground">
            Lo que cobran por traerlo. No encarece ningún producto.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iva">IVA (COP)</Label>
          <MoneyInput id="iva" disabled={disabled} value={iva} onChange={onIvaChange} placeholder="opcional" />
        </div>
      </div>

      {/* Conciliación en vivo. Antes el descuadre solo aparecía al enviar, como
          error; acá se ve mientras se escribe y dice exactamente qué revisar. */}
      {total !== '' && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
          {freightMayorQueTotal ? (
            <p className="text-destructive">
              El domicilio no puede ser mayor al total de la factura.
            </p>
          ) : (
            <>
              <dl className="space-y-1 tabular-nums">
                {freightNum > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Mercancía (total − domicilio)</dt>
                    <dd className="font-medium text-foreground">{formatCop(mercancia)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Suma de los ítems</dt>
                  <dd className={cuadra ? 'font-medium text-foreground' : 'font-medium text-warning'}>
                    {formatCop(computedItemsTotal)}
                  </dd>
                </div>
              </dl>
              <p className={`mt-2 text-xs ${cuadra ? 'text-success' : 'text-warning'}`}>
                {cuadra
                  ? 'Cuadra.'
                  : diferencia > 0
                    ? `Faltan ${formatCop(diferencia)} en los ítems. Si es el domicilio, escríbelo arriba.`
                    : `Los ítems suman ${formatCop(Math.abs(diferencia))} de más. Revisa si el domicilio quedó cargado como ítem.`}
              </p>
            </>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <textarea id="notes" rows={2} maxLength={500} disabled={disabled} value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Comentarios opcionales sobre la factura." className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
    </section>
  );
}
