'use client';

import { SearchInput } from '@pos-tercos/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TOTAL_SECTIONS } from '@pos-tercos/domain';
import { MIN_QUERY_LENGTH, searchSections } from '../lib/search';
import { AudienceBadges } from './AudienceBadges';

/** Buscador sobre TODO el contenido de la guía. El filtro vive en `lib/search`. */
export function GuiaSearch() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchSections(query), [query]);
  const searching = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div className="space-y-3">
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery('')}
        placeholder="Buscar: cerrar caja, merma, domicilio, descuadre…"
        aria-label="Buscar en la guía"
      />

      {!searching ? (
        <p className="text-xs text-muted-foreground">
          {TOTAL_SECTIONS} temas explicados. Escribe al menos {MIN_QUERY_LENGTH} letras para buscar.
        </p>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          No hay nada con esas palabras. Prueba con una sola, o revisa el índice de abajo.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {results.map(({ chapterId, chapterTitle, section }) => (
            <li key={`${chapterId}-${section.id}`}>
              <Link
                href={`/guia/${chapterId}#${section.id}`}
                className="block px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{section.title}</span>
                  <AudienceBadges audience={section.audience} />
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {chapterTitle} · {section.summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
