'use client';

import { Money, NumberInput } from '@pos-tercos/ui';
import type { DigitalTarget } from '../lib/digital-arqueo';

/**
 * Arqueo de CUENTA del cierre: el cajero revisa cada app (Nequi/banco) y anota
 * cuánto entró durante el turno. Es OBLIGATORIO — cerrar sin contar un método
 * dejaba esa plata sin verificar y fuera del descuadre. La diferencia respeta
 * el conteo ciego (no se muestra hasta revelar).
 */
export function DigitalCountSection({
  targets,
  values,
  onChange,
  showExpected,
  disabled,
}: {
  targets: DigitalTarget[];
  values: Record<string, number | null>;
  onChange: (method: string, value: number | null) => void;
  showExpected: boolean;
  disabled: boolean;
}) {
  if (targets.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <h3 className="caps text-[0.625rem] font-semibold tracking-[0.2em] text-muted-foreground">
        Arqueo de cuenta · según cada app
      </h3>
      {targets.map((t) => {
        const counted = values[t.method] ?? null;
        const diff = counted !== null ? counted - t.expected : null;
        return (
          <div key={t.method} className="flex flex-wrap items-center gap-2">
            <span className="w-32 shrink-0 text-sm text-foreground">{t.name}</span>
            <div className="w-36">
              <NumberInput
                value={counted}
                onChange={(v) => onChange(t.method, v)}
                prefix="$"
                grouping
                min={0}
                placeholder={showExpected ? String(t.expected) : 'Según la app'}
                disabled={disabled}
                required
                aria-label={`Total según la app de ${t.name}`}
              />
            </div>
            {counted === null ? (
              <span className="text-xs font-semibold text-warning">falta contar</span>
            ) : null}
            {showExpected ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                esperado <Money amount={t.expected} size="xs" className="text-current" />
              </span>
            ) : null}
            {showExpected && diff !== null && diff !== 0 ? (
              <span
                className={`text-xs font-semibold tabular-nums ${
                  diff < 0 ? 'text-destructive' : 'text-warning'
                }`}
              >
                {diff > 0 ? '+' : ''}
                <Money amount={diff} size="xs" className="text-current" />{' '}
                {diff < 0 ? 'faltante' : 'sobrante'}
              </span>
            ) : null}
            {showExpected && diff === 0 ? (
              <span className="text-xs font-semibold text-success">cuadra ✓</span>
            ) : null}
          </div>
        );
      })}
      <p className="text-[0.6875rem] text-muted-foreground">
        Abre cada app y suma lo que entró en el turno. Hay que contar todos: si por un medio no
        entró nada, escribe 0.
      </p>
    </section>
  );
}
