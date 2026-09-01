'use client';

import type { Subproduct, UserRole } from '@pos-tercos/types';
import { EmptyState } from '@pos-tercos/ui';
import { useState } from 'react';
import { ListSearch, noResultsCopy } from '../../../components/ListSearch';
import { filtrarPorTexto } from '../../../lib/buscar';
import { SubproductsTable } from './SubproductsTable';

/** Subproductos con buscador (mismo criterio que insumos y productos). */
export function SubproductsList({
  subproducts,
  costById,
  stockById,
  userRole,
}: {
  subproducts: Subproduct[];
  costById?: Map<string, number | null>;
  stockById?: Map<string, number>;
  userRole?: UserRole;
}) {
  const [query, setQuery] = useState('');
  const filtered = filtrarPorTexto(subproducts, query, (s) => s.name);
  const searching = query.trim().length > 0;

  return (
    <>
      <ListSearch
        value={query}
        onChange={setQuery}
        placeholder="Buscar subproducto por nombre"
        label="Buscar subproducto por nombre"
        visibleCount={filtered.length}
        totalCount={subproducts.length}
        noun={['subproducto', 'subproductos']}
      />
      {searching && filtered.length === 0 ? (
        <EmptyState size="sm" {...noResultsCopy(query, 'subproducto')} />
      ) : (
        <SubproductsTable
          subproducts={filtered}
          costById={costById}
          stockById={stockById}
          userRole={userRole}
        />
      )}
    </>
  );
}
