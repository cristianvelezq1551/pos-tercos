import { Injectable, NotFoundException } from '@nestjs/common';
import {
  normalizeConversionFactor,
  type PurchaseOrderDoc,
  type ShortageListDoc,
} from '@pos-tercos/domain';
import type { PurchaseList, PurchaseListItem } from '@pos-tercos/types';
import { businessName } from '../common/business-name';
import { BusinessConfigService } from '../business-config/business-config.service';
import { PurchaseListsService } from './purchase-lists.service';

/**
 * Arma los dos papeles de una lista de faltantes:
 *
 *  - **General** (interno): todo junto, con existencias, mínimo, costos y
 *    total. Es la hoja con la que se sale a comprar.
 *  - **Por proveedor**: solo lo que le toca a ese proveedor y SIN costos, que
 *    es el documento que se le entrega (§7.v19: con proveedores no se habla de
 *    precios, y además el costo que tenemos es el de la última factura, que
 *    pudo ser de su competencia).
 *
 * Se arman en el servidor porque los datos del negocio viven en la
 * configuración: si el papel y el WhatsApp se armaran por separado acabarían
 * diciendo cosas distintas.
 */
@Injectable()
export class PurchaseListDocsService {
  constructor(
    private readonly lists: PurchaseListsService,
    private readonly businessConfig: BusinessConfigService,
  ) {}

  async generalDoc(listId: string): Promise<ShortageListDoc> {
    const list = await this.lists.getById(listId);
    return {
      businessName: businessName(),
      title: list.title?.trim() || 'Lista de faltantes',
      issuedOnLabel: formatLongDate(new Date(list.createdAt)),
      requestedBy: list.createdByName,
      notes: list.notes,
      items: list.items.map((it) => ({
        name: it.entityName,
        quantity: it.quantity,
        unitPurchase: it.unitPurchase,
        equivalence: equivalenceOf(it),
        currentStock: it.currentStock,
        thresholdMin: it.thresholdMin,
        unitStock: it.unitStock,
        estTotal: it.estTotal,
        supplierName: it.supplierName,
        note: it.note,
      })),
      estTotal: list.estTotal,
      itemsWithoutCost: list.itemsWithoutCost,
    };
  }

  /**
   * @param supplierId null = los ítems que quedaron SIN proveedor asignado.
   *   Se puede pedir a propósito: son los que hay que salir a conseguir.
   */
  async supplierDoc(listId: string, supplierId: string | null): Promise<PurchaseOrderDoc> {
    const [list, config] = await Promise.all([
      this.lists.getById(listId),
      this.businessConfig.get(),
    ]);
    const items = list.items.filter((it) => (it.supplierId ?? null) === supplierId);
    if (items.length === 0) {
      throw new NotFoundException(
        'Ese proveedor no tiene ningún renglón en esta lista. Asígnale ítems primero.',
      );
    }

    return {
      businessName: businessName(),
      businessPhone: config.phoneDisplay || config.phone || null,
      businessAddress: config.address || null,
      supplierName: items[0].supplierName ?? 'Por definir',
      supplierPhone: null,
      issuedOnLabel: formatLongDate(new Date(list.createdAt)),
      neededByLabel: null,
      requestedBy: list.createdByName,
      note: list.notes,
      items: items.map((it) => ({
        name: it.entityName,
        quantity: it.quantity,
        unitPurchase: it.unitPurchase,
        equivalence: equivalenceOf(it),
        // Sin costos: este papel se le entrega al proveedor.
        estTotal: null,
      })),
      estTotal: null,
    };
  }

  /** Proveedores presentes en la lista, para ofrecer un papel por cada uno. */
  async suppliersIn(
    listId: string,
  ): Promise<Array<{ supplierId: string | null; supplierName: string; itemCount: number }>> {
    const list = await this.lists.getById(listId);
    const map = new Map<string | null, { supplierName: string; itemCount: number }>();
    for (const it of list.items) {
      const key = it.supplierId ?? null;
      const prev = map.get(key);
      if (prev) prev.itemCount += 1;
      else map.set(key, { supplierName: it.supplierName ?? 'Sin proveedor asignado', itemCount: 1 });
    }
    return [...map.entries()].map(([supplierId, v]) => ({ supplierId, ...v }));
  }
}

/** "4 paquete = 48 unidad". Null cuando comprar y contar usan la misma unidad. */
function equivalenceOf(it: PurchaseListItem): string | null {
  const factor = normalizeConversionFactor(it.conversionFactor);
  if (factor === 1 && it.unitPurchase === it.unitStock) return null;
  const total = (it.quantity * factor).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  return `${total} ${it.unitStock}`;
}

function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export type { PurchaseList };
