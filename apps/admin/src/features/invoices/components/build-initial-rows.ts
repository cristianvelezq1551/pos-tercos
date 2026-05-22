import { bestMatch } from '@pos-tercos/domain';
import type { InvoiceDraftResponse, Stockable } from '@pos-tercos/types';
import type { DraftRow } from './InvoiceItemRow';

let rowCounter = 0;
export function nextRowId(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

/** Builds the initial DraftRow array from a draft invoice + known stockables.
 *  Uses persisted item selections when available; falls back to fuzzy-match suggestions. */
export function buildInitialRows(draft: InvoiceDraftResponse, stockables: Stockable[]): DraftRow[] {
  const persistedItems = draft.invoice.items ?? [];
  const useDbItems =
    persistedItems.length > 0 &&
    persistedItems.length === draft.extraction.items.length;

  return draft.extraction.items.map((item, idx) => {
    const persisted = useDbItems ? persistedItems[idx] : undefined;

    let selection: DraftRow['selection'] = null;
    if (persisted?.entityType) {
      const id =
        persisted.entityType === 'INGREDIENT'
          ? persisted.ingredientId
          : persisted.productId;
      if (id) {
        const stockable = stockables.find(
          (s) => s.id === id && s.type === persisted.entityType,
        );
        if (stockable) {
          selection = {
            entityType: stockable.type,
            id: stockable.id,
          };
        }
      }
    }

    let suggestion: DraftRow['suggestion'] = null;
    if (!selection) {
      const match = bestMatch(item.descriptionRaw, stockables, (s) => s.name, 0.4);
      if (match) {
        suggestion = {
          entityType: match.candidate.type,
          id: match.candidate.id,
          name: match.candidate.name,
          score: match.score,
        };
      }
    }

    return {
      localId: nextRowId(),
      selection,
      descriptionRaw: item.descriptionRaw,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      total: item.total,
      suggestion,
    };
  });
}
