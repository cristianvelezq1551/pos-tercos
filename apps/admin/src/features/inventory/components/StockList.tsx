'use client';

import type { Stockable } from '@pos-tercos/types';
import { EmptyState } from '@pos-tercos/ui';
import { useState } from 'react';
import { ListSearch, noResultsCopy } from '../../../components/ListSearch';
import { filtrarPorTexto } from '../../../lib/buscar';
import { StockTable } from './StockTable';

/** Existencias con buscador. Filtra en el navegador sobre la lista completa. */
export function StockList({ rows }: { rows: Stockable[] }) {
  const [query, setQuery] = useState('');
  const filtered = filtrarPorTexto(rows, query, (r) => `${r.name} ${r.category ?? ''}`);
  const searching = query.trim().length > 0;

  return (
    <>
      <ListSearch
        value={query}
        onChange={setQuery}
        placeholder="Buscar por nombre o categoría"
        label="Buscar existencias por nombre o categoría"
        visibleCount={filtered.length}
        totalCount={rows.length}
        noun={['ítem', 'ítems']}
      />
      {searching && filtered.length === 0 ? (
        <EmptyState size="sm" {...noResultsCopy(query, 'ítem')} />
      ) : (
        <StockTable rows={filtered} />
      )}
    </>
  );
}
