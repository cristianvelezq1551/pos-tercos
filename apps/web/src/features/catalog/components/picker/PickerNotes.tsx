'use client';

export const MAX_NOTE_LENGTH = 140;

/** Nota libre para la cocina (opcional, acotada). */
export function PickerNotes({
  notes,
  onChange,
}: {
  notes: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="picker-notes" className="text-sm font-semibold text-foreground">
        Nota para la cocina{' '}
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </label>
      <textarea
        id="picker-notes"
        value={notes}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_NOTE_LENGTH))}
        rows={2}
        placeholder="Ej. sin cebolla, término medio…"
        className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <span className="self-end text-[11px] tabular-nums text-muted-foreground">
        {notes.length}/{MAX_NOTE_LENGTH}
      </span>
    </div>
  );
}
