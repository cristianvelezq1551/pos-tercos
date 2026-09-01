'use client';

import { SearchInput, cn } from '@pos-tercos/ui';
import { Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { CategoryTab } from './CategoryTab';

export const ALL_CATEGORIES = '__all__';

/**
 * Categorías + buscador. La lupa se abre en un campo que busca en TODO el
 * menú (por eso al buscar la categoría vuelve a "Todo": el alcance que se ve
 * es el que manda).
 */
export function CatalogToolbar({
  categories,
  activeCategory,
  onSelectCategory,
  query,
  onQueryChange,
  searchOpen,
  onSearchOpenChange,
  visibleCount,
  totalCount,
}: {
  categories: string[];
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  visibleCount: number;
  totalCount: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // "/" enfoca la búsqueda — atajo estándar, pero solo si no se está tecleando
  // en otro campo (si no, secuestra el motivo de una anulación).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable) return;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      onSearchOpenChange(true);
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSearchOpenChange]);

  const closeSearch = () => {
    onQueryChange('');
    onSearchOpenChange(false);
  };

  const searching = query.trim().length > 0;

  // Una sola fila que se desplaza. Partidos en dos, los chips se comían un
  // renglón de catálogo justo en la pantalla que menos alto tiene.
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2.5 sm:px-4">
      <CategoryTab
        label="Todo"
        active={activeCategory === ALL_CATEGORIES && !searching}
        onClick={() => onSelectCategory(ALL_CATEGORIES)}
      />
      {categories.map((c) => (
        <CategoryTab
          key={c}
          label={c}
          active={activeCategory === c && !searching}
          onClick={() => onSelectCategory(c)}
        />
      ))}

      {/* Grupo derecho. Con la búsqueda abierta ocupa su propia línea en
          teléfono (el campo necesita ancho) y se acopla a la derecha en ≥sm. */}
      <div
        className={cn(
          'ml-auto flex min-w-0 items-center gap-2 pl-2',
          searchOpen && 'max-sm:w-full max-sm:pl-0 max-sm:pt-1',
        )}
      >
        <span className="caps shrink-0 text-[0.625rem] text-muted-foreground">
          {searching ? (
            <>
              {visibleCount} {visibleCount === 1 ? 'resultado' : 'resultados'}
            </>
          ) : (
            <>
              {visibleCount} de {totalCount}
            </>
          )}
        </span>

        {searchOpen ? (
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
            <SearchInput
              ref={inputRef}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSearch();
              }}
              onClear={() => onQueryChange('')}
              placeholder="Buscar en todo el menú"
              aria-label="Buscar producto en todo el menú"
              className="h-9 min-w-0 flex-1 sm:w-56 sm:flex-none md:w-64"
            />
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Cerrar búsqueda"
              title="Cerrar búsqueda"
              className={cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
                'hover:bg-ink-800 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSearchOpenChange(true)}
            aria-label="Buscar producto"
            title="Buscar producto en todo el menú"
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors',
              'hover:bg-ink-800 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <Search className="h-[1.125rem] w-[1.125rem]" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
