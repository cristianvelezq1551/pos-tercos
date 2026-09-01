'use client';

import { SearchInput } from '@pos-tercos/ui';

/**
 * Buscador de las listas del catálogo (insumos, subproductos, productos).
 * Muestra siempre cuántas filas quedan a la vista: con 80 insumos, filtrar sin
 * decir cuántos quedaron parece que la lista se vació.
 */
export function ListSearch({
  value,
  onChange,
  placeholder,
  label,
  visibleCount,
  totalCount,
  noun,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Nombre accesible del campo (lo lee un lector de pantalla). */
  label: string;
  visibleCount: number;
  totalCount: number;
  /** Cómo se llama lo que se lista, en singular y plural. */
  noun: [string, string];
}) {
  const searching = value.trim().length > 0;
  const [singular, plural] = noun;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <SearchInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClear={() => onChange('')}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
        }}
        placeholder={placeholder}
        aria-label={label}
        // 44 px de alto REAL: `h-11` estira el marco, pero el toque aterriza
        // en el <input>, que sin esto se queda en 36 px centrado adentro.
        className="h-11 w-full [&_input]:h-full sm:w-80"
      />
      <span className="caps text-[0.625rem] text-muted-foreground">
        {searching ? (
          <>
            {visibleCount} de {totalCount} {totalCount === 1 ? singular : plural}
          </>
        ) : (
          <>
            {totalCount} {totalCount === 1 ? singular : plural}
          </>
        )}
      </span>
    </div>
  );
}

/** Empty state de "no hay coincidencias" — distinto de "la lista está vacía". */
export function noResultsCopy(query: string, singular: string) {
  return {
    title: `Ningún ${singular} coincide`,
    description: `Nada en la lista coincide con "${query.trim()}". Revisa cómo está escrito o limpia la búsqueda.`,
  };
}
