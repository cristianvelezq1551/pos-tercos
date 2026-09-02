'use client';

import type { InventoryMovement } from '@pos-tercos/types';
import { EmptyState } from '@pos-tercos/ui';
import { useState } from 'react';
import { ListSearch, noResultsCopy } from '../../../components/ListSearch';
import { filtrarPorTexto } from '../../../lib/buscar';
import { MovementsTable } from './MovementsTable';

/**
 * Movimientos con buscador. Busca en el nombre del ítem, la nota y quién lo
 * hizo — que es como se busca un movimiento ("la merma de pan", "lo que
 * ajustó Rony").
 *
 * ⚠️ Busca dentro de lo que YA está cargado (la página trae las últimas 200
 * del filtro elegido). Por eso el contador dice sobre cuántas busca: creer que
 * recorrió toda la historia y no encontrar nada es peor que no buscar.
 */
export function MovementsList({ rows }: { rows: InventoryMovement[] }) {
  const [query, setQuery] = useState('');
  const filtered = filtrarPorTexto(
    rows,
    query,
    (m) => `${m.itemName ?? ''} ${m.notes ?? ''} ${m.userFullName ?? ''}`,
  );
  const searching = query.trim().length > 0;

  return (
    <>
      <ListSearch
        value={query}
        onChange={setQuery}
        placeholder="Buscar por ítem, nota o persona"
        label="Buscar movimientos por ítem, nota o persona"
        visibleCount={filtered.length}
        totalCount={rows.length}
        noun={['movimiento cargado', 'movimientos cargados']}
      />
      {searching && filtered.length === 0 ? (
        <EmptyState size="sm" {...noResultsCopy(query, 'movimiento')} />
      ) : (
        // El cómputo de "cuánto se devolvió ya" mira SIEMPRE la lista completa:
        // con las filas filtradas, una merma cuya reversa quedó fuera del
        // filtro volvería a ofrecer el botón de anular.
        <MovementsTable rows={filtered} reversalSource={rows} />
      )}
    </>
  );
}
