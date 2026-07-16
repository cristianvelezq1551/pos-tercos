'use client';

import { Button, Card } from '@pos-tercos/ui';
import { Check, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Contenedor de cada bloque de la config. Cada sección guarda por su cuenta
 * (un PATCH con sus campos): el dueño toca lo que necesita y confirma ahí
 * mismo, sin un botón global que mande cambios que no recuerda haber hecho.
 */
export function SectionCard({
  title,
  description,
  icon,
  children,
  onSave,
  state,
  error,
  dirty,
  saveLabel = 'Guardar',
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  onSave: () => void;
  state: SaveState;
  error: string | null;
  dirty: boolean;
  saveLabel?: string;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </header>

      <div className="space-y-4">{children}</div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <footer className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-4">
        {state === 'saved' && !dirty ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-500">
            <Check className="h-4 w-4" strokeWidth={2.5} /> Guardado
          </span>
        ) : null}
        <Button onClick={onSave} disabled={!dirty || state === 'saving'}>
          {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saveLabel}
        </Button>
      </footer>
    </Card>
  );
}
