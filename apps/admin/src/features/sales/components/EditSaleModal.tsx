'use client';

import type { ManualDiscount, Product, Promotion, Sale } from '@pos-tercos/types';
import { Button, Dialog, Money } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { ProductPickerModal, fetchActiveProducts, useAvailability } from '../../catalog';
import { notifyCajaChanged } from '../../caja-shifts/lib/caja-events';
import { editSaleItems } from '../api/edit';
import { fetchActivePromotions } from '../api';
import { printComanda, sendTabToKitchen } from '../api/print';
import { notifyComandaFailed } from '../lib/comanda-events';
import { AddProductChips } from './AddProductChips';
import { EditSaleLineRow, type EditLine } from './EditSaleLineRow';
import { saleItemsToEditLines, selectionToEditLine } from '../lib/edit-sale-lines';
import type { CartLine } from '../lib/cart-types';
import { computeCartTotals, type ManualCartDiscounts } from '../lib/totals';
import { getErrorMessage } from '../../../lib/errors';
import { logError } from '../../../lib/client-log';

/**
 * Edición de un pedido YA COBRADO. Si la cocina ya lo inició, las líneas de
 * preparación quedan bloqueadas (candado) y solo se tocan las de reventa
 * directa (bebidas, snacks). El backend recalcula precios/promos y ajusta
 * stock y pago por la diferencia.
 */
export function EditSaleModal({
  sale,
  open,
  onClose,
  onSaved,
}: {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Sale) => void;
}) {
  const [lines, setLines] = useState<EditLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Solo cuando la cocina YA tiene el pedido se congelan las líneas de
  // preparación. PENDIENTE_PAGO y PAGADO (sin iniciar) se editan completos.
  const kitchenStarted =
    sale !== null &&
    (sale.status === 'EN_PREPARACION' || sale.status === 'LISTO_DESPACHO');
  // Disponibilidad en vivo: lo agotado se ve y NO se puede agregar.
  const { byId: availability } = useAvailability();
  const isAvailable = (productId: string) => availability.get(productId)?.available !== false;

  useEffect(() => {
    if (!open || !sale) return;
    setError(null);
    setPending(false);
    setPickerProduct(null);
    void fetchActiveProducts().then((all) => {
      setProducts(all);
      const resaleMap = new Map(all.map((p) => [p.id, p.directResale] as const));
      setLines(saleItemsToEditLines(sale, resaleMap));
    });
    // Promos activas para que el estimado coincida con el recálculo del server.
    // Si falla, el estimado cae a "sin promos" (el server sigue siendo la verdad).
    void fetchActivePromotions()
      .then(setPromotions)
      .catch((e) => {
        logError('edit-sale-promotions', e, { saleId: sale.id });
        setPromotions([]);
      });
  }, [open, sale?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Estimado con el MISMO motor que el server usa al guardar (SalesEditService):
  // descuento manual (de línea u orden) desactiva promos para toda la venta;
  // sin manual, aplican las promos activas AHORA. El descuento sobre el total
  // lo preserva el server (no se reenvía); los de línea se reenvían abajo.
  const comboById = new Map(products.map((p) => [p.id, p.isCombo] as const));
  const cartLines: CartLine[] = lines.map((l, i) => ({
    lineId: String(i),
    productId: l.productId,
    productName: l.productName,
    size: null,
    modifiers: [],
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    // COMBO_OFF: el estimado debe usar el mismo isCombo que el server (computeLine).
    isCombo: comboById.get(l.productId) ?? false,
  }));
  const manual: ManualCartDiscounts | undefined = (() => {
    if (!sale) return undefined;
    const lineDiscounts: Record<string, ManualDiscount> = {};
    lines.forEach((l, i) => {
      if (l.manualDiscount) lineDiscounts[String(i)] = l.manualDiscount;
    });
    const orderDiscount = sale.orderDiscount ?? null;
    return orderDiscount !== null || Object.keys(lineDiscounts).length > 0
      ? { lineDiscounts, orderDiscount }
      : undefined;
  })();
  const totals = computeCartTotals(cartLines, promotions, new Date(), manual);
  const estimatedTotal = totals.total;
  const diff = sale ? estimatedTotal - sale.total : 0;
  const canSave = lines.length > 0 && !pending;

  const handleSave = async () => {
    if (!sale || !canSave) return;
    setPending(true);
    setError(null);
    try {
      // Reenviar los descuentos manuales de línea preserva lo que el cajero ya
      // otorgó (el server los toma del payload, no de las filas viejas). Exigen
      // motivo — se reusa el de la venta (existe siempre que hubo descuento).
      const keepLineDiscounts = sale.discountReason != null;
      const sendsLineDiscounts =
        keepLineDiscounts && lines.some((l) => l.manualDiscount !== null);
      const updated = await editSaleItems(sale.id, {
        items: lines.map((l) => ({
          productId: l.productId,
          sizeId: l.sizeId ?? undefined,
          quantity: l.quantity,
          modifiers: l.modifierIds.length
            ? l.modifierIds.map((modifierId) => ({ modifierId }))
            : undefined,
          notes: l.notes ?? undefined,
          manualDiscount:
            keepLineDiscounts && l.manualDiscount ? l.manualDiscount : undefined,
        })),
        discountReason: sendsLineDiscounts ? (sale.discountReason ?? undefined) : undefined,
      });
      // Cuenta abierta sin pagar: lo NUEVO va por comanda incremental (tanda
      // "ADICIÓN"); si se quitó una línea ya enviada, avisar a cocina de voz.
      // Pedido cobrado: reimprime la comanda CORREGIDA completa, marcada
      // "PEDIDO MODIFICADO" (best-effort: si falla, va al log).
      if (sale.isOpenTab && sale.status === 'PENDIENTE_PAGO') {
        void sendTabToKitchen(sale.id).catch((e) => {
          logError('print-comanda-edit', e, { saleId: sale.id });
          notifyComandaFailed({ saleId: sale.id, receiptNumber: sale.receiptNumber, kind: 'tanda' });
        });
      } else {
        void printComanda(sale.id, { corrected: true }).catch((e) => {
          logError('print-comanda-edit', e, { saleId: sale.id });
          notifyComandaFailed({ saleId: sale.id, receiptNumber: sale.receiptNumber, kind: 'modificada' });
        });
      }
      notifyCajaChanged();
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Error guardando los cambios'));
      setPending(false);
    }
  };

  if (!sale) return null;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title={`Editar pedido · ${`Recibo #${sale.receiptNumber}`}`}
      description={
        kitchenStarted
          ? 'La cocina ya inició este pedido: solo se pueden cambiar productos de reventa (ej. bebidas).'
          : 'El pedido aún no se inició en cocina: se puede cambiar todo.'
      }
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave}>
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <ul className="space-y-1.5">
          {lines.map((l, i) => (
            <EditSaleLineRow
              key={`${l.productId}-${l.sizeId ?? ''}-${i}`}
              line={l}
              busy={pending}
              plusDisabled={!isAvailable(l.productId)}
              lineDiscount={totals.lines[i]?.lineDiscount ?? 0}
              lineTotal={totals.lines[i]?.lineTotal}
              onQty={(delta) =>
                setLines((prev) =>
                  prev.map((x, j) =>
                    j === i ? { ...x, quantity: Math.max(1, x.quantity + delta) } : x,
                  ),
                )
              }
              onRemove={() => setLines((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </ul>

        <AddProductChips
          products={products}
          kitchenStarted={kitchenStarted}
          pending={pending}
          isAvailable={isAvailable}
          onPick={setPickerProduct}
        />

        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Nuevo total estimado
            {diff !== 0 ? (
              <span className={diff > 0 ? 'text-warning' : 'text-success'}>
                {' '}
                ({diff > 0 ? 'cobrar' : 'devolver'} {Math.abs(diff).toLocaleString('es-CO')})
              </span>
            ) : null}
          </span>
          <Money amount={estimatedTotal} weight="semibold" />
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">
          El sistema recalcula promociones y stock al guardar. Si el total cambia,
          cobrá o devolvé la diferencia al cliente — el pago registrado se ajusta solo.
        </p>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <ProductPickerModal
        product={pickerProduct}
        open={pickerProduct !== null}
        onClose={() => setPickerProduct(null)}
        onConfirm={(sel) => setLines((prev) => [...prev, selectionToEditLine(sel)])}
      />
    </Dialog>
  );
}
