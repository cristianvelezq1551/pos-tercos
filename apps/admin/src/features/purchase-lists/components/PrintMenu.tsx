'use client';

import { renderPurchaseOrderHtml, renderShortageListHtml } from '@pos-tercos/domain';
import type { PurchaseOrderDoc, ShortageListDoc } from '@pos-tercos/domain';
import { Button } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { getGeneralDoc, getSupplierDoc, listSuppliersInList, type SupplierInList } from '../api';

/**
 * Abre el papel en una pestaña y lanza el diálogo de impresión, donde el
 * navegador ofrece "Guardar como PDF".
 *
 * SIN `noopener`: con esa bandera `window.open` devuelve null y la pestaña
 * abre en blanco. Acá no hace falta — el contenido lo generamos nosotros.
 */
function abrirDocumento(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

/**
 * Los dos papeles de una lista:
 *  - **General**: interno, con existencias, costos y total. Con el que se sale
 *    a comprar.
 *  - **Por proveedor**: solo lo suyo y SIN costos, que es el que se le entrega
 *    (§7.v19: con proveedores no se habla de precios, y el costo que tenemos
 *    pudo ser el de su competencia).
 */
export function PrintMenu({ listId, itemCount }: { listId: string; itemCount: number }) {
  const [suppliers, setSuppliers] = useState<SupplierInList[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (itemCount === 0) {
      setSuppliers([]);
      return;
    }
    let cancelled = false;
    listSuppliersInList(listId)
      .then((res: SupplierInList[]) => {
        if (!cancelled) setSuppliers(res);
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listId, itemCount]);

  async function abrir(kind: string, cargar: () => Promise<string>) {
    setPending(kind);
    setError(null);
    try {
      if (!abrirDocumento(await cargar())) {
        setError(
          'El navegador bloqueó la ventana. Permite las ventanas emergentes de este sitio y vuelve a intentar.',
        );
      }
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo armar el documento.'));
    }
    setPending(null);
  }

  if (itemCount === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          type="button"
          disabled={pending !== null}
          onClick={() =>
            void abrir('general', async () =>
              renderShortageListHtml(
                (await getGeneralDoc(listId)) as unknown as ShortageListDoc,
              ),
            )
          }
        >
          {pending === 'general' ? 'Abriendo…' : 'Imprimir lista completa'}
        </Button>

        {(suppliers ?? []).map((s) => {
          const key = s.supplierId ?? 'none';
          return (
            <Button
              key={key}
              size="sm"
              variant="outline"
              type="button"
              disabled={pending !== null}
              title={`Solo los ${s.itemCount} renglones de ${s.supplierName}, sin costos.`}
              onClick={() =>
                void abrir(key, async () =>
                  renderPurchaseOrderHtml(
                    (await getSupplierDoc(listId, s.supplierId)) as unknown as PurchaseOrderDoc,
                  ),
                )
              }
            >
              {pending === key ? 'Abriendo…' : `${s.supplierName} (${s.itemCount})`}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        La lista completa lleva costos y es de uso interno. El papel de cada proveedor va sin
        precios: el costo que guardamos es el de la última factura, que pudo ser de otro.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
