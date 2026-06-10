'use client';

import { Button } from '@pos-tercos/ui';
import { ChefHat } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ProductionDialog } from './ProductionDialog';

/** Botón inline (icon-only) "Producir" para usar en tablas. Abre el diálogo
 *  de producción y refresca server-side al cerrar con éxito. */
export function ProduceSubproductAction({
  subproductId,
  name,
  unit,
  yieldValue,
  variant = 'compact',
}: {
  subproductId: string;
  name: string;
  unit: string;
  yieldValue: number;
  /** compact = icon-only para tabla; full = botón con texto. */
  variant?: 'compact' | 'full';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'compact' ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen(true)}
          title={`Producir ${name}`}
          aria-label={`Producir ${name}`}
          className="-my-1 h-7 px-2 text-info hover:text-info"
        >
          <ChefHat className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <ChefHat className="h-4 w-4" /> Producir
        </Button>
      )}
      <ProductionDialog
        subproduct={{ id: subproductId, name, unit, yield: yieldValue }}
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
