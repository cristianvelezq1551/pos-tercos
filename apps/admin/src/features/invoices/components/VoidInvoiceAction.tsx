'use client';

import type { Invoice } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { VoidInvoiceDialog } from './VoidInvoiceDialog';

/**
 * Botón de anular, solo para el Dueño y solo sobre una factura confirmada.
 *
 * El backend vuelve a validar todo (rol, PIN, plazo, que no esté pagada): esto
 * es únicamente para no ofrecer una acción que va a ser rechazada.
 */
export function VoidInvoiceAction({ invoice, isDueno }: { invoice: Invoice; isDueno: boolean }) {
  const [abierto, setAbierto] = useState(false);
  if (!isDueno || invoice.status !== 'CONFIRMED') return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Ban className="mr-1.5 h-3.5 w-3.5" />
        Anular
      </Button>
      {abierto && <VoidInvoiceDialog invoice={invoice} onClose={() => setAbierto(false)} />}
    </>
  );
}
