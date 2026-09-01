'use client';

import type { Ingredient, UserRole } from '@pos-tercos/types';
import { EmptyState } from '@pos-tercos/ui';
import { useState } from 'react';
import { ListSearch, noResultsCopy } from '../../../components/ListSearch';
import { filtrarPorTexto } from '../../../lib/buscar';
import { IngredientsTable } from './IngredientsTable';

/**
 * Insumos con buscador. El filtro es en el navegador (la lista completa ya
 * llegó del servidor): teclear no espera una request.
 */
export function IngredientsList({
  ingredients,
  userRole,
}: {
  ingredients: Ingredient[];
  userRole?: UserRole;
}) {
  const [query, setQuery] = useState('');
  const filtered = filtrarPorTexto(ingredients, query, (i) => i.name);
  const searching = query.trim().length > 0;

  return (
    <>
      <ListSearch
        value={query}
        onChange={setQuery}
        placeholder="Buscar insumo por nombre"
        label="Buscar insumo por nombre"
        visibleCount={filtered.length}
        totalCount={ingredients.length}
        noun={['insumo', 'insumos']}
      />
      {searching && filtered.length === 0 ? (
        <EmptyState size="sm" {...noResultsCopy(query, 'insumo')} />
      ) : (
        <IngredientsTable ingredients={filtered} userRole={userRole} />
      )}
    </>
  );
}
