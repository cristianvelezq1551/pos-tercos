'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface SearchInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  /** Mostrar atajo visual (`/` o `⌘K`). Solo decorativo. */
  shortcut?: string;
  /** Callback opcional para "limpiar". Si se pasa, muestra la X cuando hay texto. */
  onClear?: () => void;
}

/**
 * Input de búsqueda con ícono lupa, X opcional para limpiar y atajo visual.
 * El comportamiento del atajo (focus on `/`, etc.) lo maneja el consumidor.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, shortcut, onClear, value, ...rest }, ref) => {
    const hasValue = typeof value === 'string' && value.length > 0;
    return (
      <div
        className={cn(
          'group relative flex h-10 w-full items-center rounded-md border border-input bg-card transition-colors duration-150 ease-out',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background focus-within:border-primary',
          'hover:border-ink-400',
          className,
        )}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="9" cy="9" r="6" />
          <path d="m13.5 13.5 4 4" />
        </svg>
        <input
          ref={ref}
          type="search"
          value={value}
          className={cn(
            'flex-1 bg-transparent px-3 py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none',
            '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden',
          )}
          {...rest}
        />
        {hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Limpiar"
            className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 0 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : null}
        {shortcut && !hasValue ? (
          <kbd className="caps mr-2 hidden h-6 select-none items-center rounded border border-border bg-muted px-1.5 text-[0.625rem] text-muted-foreground sm:inline-flex">
            {shortcut}
          </kbd>
        ) : null}
      </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';
