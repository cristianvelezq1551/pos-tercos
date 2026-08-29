'use client';

import type { Invoice } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { Truck } from 'lucide-react';
import { useState } from 'react';
import { EditFreightDialog } from './EditFreightDialog';

/**
 * Botón para corregir el domicilio de una factura confirmada.
 *
 * Solo aparece en CONFIRMED: en un borrador el domicilio se escribe en el modal
 * de confirmación, y una rechazada no se edita.
 */
export function EditFreightAction({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  if (invoice.status !== 'CONFIRMED') return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Truck className="mr-1.5 h-3.5 w-3.5" />
        {invoice.freightAmount > 0 ? 'Editar domicilio' : 'Agregar domicilio'}
      </Button>
      {open && (
        <EditFreightDialog invoice={invoice} open={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
