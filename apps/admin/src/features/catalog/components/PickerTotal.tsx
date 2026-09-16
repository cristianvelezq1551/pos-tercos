'use client';

import { Money } from '@pos-tercos/ui';

/** Resumen de precio del picker: unitario × cantidad, con el ahorro de la promo. */
export function PickerTotal({
  unitPrice,
  quantity,
  lineDiscount,
}: {
  unitPrice: number;
  quantity: number;
  lineDiscount: number;
}) {
  const lineTotal = unitPrice * quantity;
  const conDescuento = lineTotal - lineDiscount;
  return (
    <>
      <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
        <span className="text-sm text-muted-foreground">
          <Money amount={unitPrice} className="text-current" /> × {quantity}
        </span>
        {lineDiscount > 0 ? (
          <span className="flex items-baseline gap-2">
            <Money amount={lineTotal} className="text-muted-foreground line-through" />
            <Money amount={conDescuento} size="xl" weight="bold" className="text-success" />
          </span>
        ) : (
          <Money amount={lineTotal} size="xl" weight="bold" />
        )}
      </div>
      {lineDiscount > 0 ? (
        <p className="-mt-2 text-right text-xs font-medium text-success">
          Promo aplicada · ahorras <Money amount={lineDiscount} className="text-success" />
        </p>
      ) : null}
    </>
  );
}
