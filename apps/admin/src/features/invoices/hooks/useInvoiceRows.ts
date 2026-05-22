'use client';

import { bestMatch } from '@pos-tercos/domain';
import { useEffect, useMemo, useState } from 'react';
import type { InvoiceDraftResponse, Stockable } from '@pos-tercos/types';
import { type DraftRow } from '../components/InvoiceItemRow';
import { buildInitialRows, nextRowId } from '../components/build-initial-rows';

export function useInvoiceRows(draft: InvoiceDraftResponse, stockables: Stockable[]) {
  const [rows, setRows] = useState<DraftRow[]>(() => buildInitialRows(draft, stockables));

  // Recompute suggestions when stockables change (e.g. user creates a new one
  // and we want to update sugerencias para otras filas).
  useEffect(() => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.selection) return r;
        const match = bestMatch(r.descriptionRaw, stockables, (s) => s.name, 0.4);
        return {
          ...r,
          suggestion: match
            ? {
                entityType: match.candidate.type,
                id: match.candidate.id,
                name: match.candidate.name,
                score: match.score,
              }
            : null,
        };
      }),
    );
  }, [stockables]);

  const updateRow = (localId: string, patch: Partial<DraftRow>): void => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const merged = { ...r, ...patch };
        if (
          (patch.quantity !== undefined || patch.unitPrice !== undefined) &&
          patch.total === undefined
        ) {
          merged.total = Math.round(merged.quantity * merged.unitPrice * 100) / 100;
        }
        return merged;
      }),
    );
  };

  const removeRow = (localId: string): void => {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  };

  const addRow = (): void => {
    setRows((prev) => [
      ...prev,
      { localId: nextRowId(), selection: null, descriptionRaw: '', quantity: 1, unit: 'kg', unitPrice: 0, total: 0, suggestion: null },
    ]);
  };

  const computedItemsTotal = useMemo(
    () => rows.reduce((acc, r) => acc + r.total, 0),
    [rows],
  );

  return { rows, updateRow, removeRow, addRow, computedItemsTotal };
}
