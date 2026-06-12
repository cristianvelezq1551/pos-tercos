'use client';

import { Button, Input } from '@pos-tercos/ui';

// Presentacional puro: el estado del draft y la validación viven en TurnPanel
// para que los errores compartan el mismo display que las demás acciones.
export function ManualCallSection({
  draft,
  busy,
  onDraftChange,
  onSubmit,
  onReset,
}: {
  draft: string;
  busy: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="shrink-0 space-y-2 border-t border-border pt-3">
      <p className="caps text-[0.625rem] tracking-[0.2em] text-muted-foreground">
        Llamar turno manual
      </p>
      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={9999}
          placeholder="Ej: 42"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          disabled={busy}
          className="flex-1"
        />
        <Button
          variant="secondary"
          disabled={busy || !draft}
          onClick={onSubmit}
          className="shrink-0"
        >
          Llamar
        </Button>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={busy}
        onClick={onReset}
      >
        Limpiar pantalla
      </Button>
    </div>
  );
}
