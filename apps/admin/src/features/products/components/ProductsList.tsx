'use client';

import type { Product, ProductCostWithVariants, UserRole } from '@pos-tercos/types';
import { EmptyState } from '@pos-tercos/ui';
import { useState } from 'react';
import { ListSearch, noResultsCopy } from '../../../components/ListSearch';
import { filtrarPorTexto } from '../../../lib/buscar';
import { ProductsTable, type RealCost } from './ProductsTable';

/**
 * Productos con buscador. Busca por nombre Y por categoría: "bebidas" tiene
 * que traer la lista de bebidas, que es como se piensa el catálogo.
 */
export function ProductsList({
  products,
  costsById,
  realCostById,
  userRole,
}: {
  products: Product[];
  costsById?: Map<string, ProductCostWithVariants>;
  realCostById?: Map<string, RealCost>;
  userRole?: UserRole;
}) {
  const [query, setQuery] = useState('');
  const filtered = filtrarPorTexto(products, query, (p) => `${p.name} ${p.category ?? ''}`);
  const searching = query.trim().length > 0;

  return (
    <>
      <ListSearch
        value={query}
        onChange={setQuery}
        placeholder="Buscar por nombre o categoría"
        label="Buscar producto por nombre o categoría"
        visibleCount={filtered.length}
        totalCount={products.length}
        noun={['producto', 'productos']}
      />
      {searching && filtered.length === 0 ? (
        <EmptyState size="sm" {...noResultsCopy(query, 'producto')} />
      ) : (
        <ProductsTable
          products={filtered}
          costsById={costsById}
          realCostById={realCostById}
          userRole={userRole}
        />
      )}
    </>
  );
}
