'use client';

import type { PaymentMethod, PaymentMethodSetting } from '@pos-tercos/types';
import { MoneyInput, formatCop } from '@pos-tercos/ui';
import type { SplitPart } from '../../lib/split';

/**
 * Una persona de la cuenta dividida: su monto, su método y la validación
 * propia (vuelto en efectivo / comprobante verificado en digital).
 */
export function SplitPartRow({
  part,
  methods,
  amountEditable,
  onChange,
}: {
  part: SplitPart;
  methods: readonly PaymentMethodSetting[];
  /** true en modo "montos libres" (en iguales/productos el monto es derivado). */
  amountEditable: boolean;
  onChange: (patch: Partial<SplitPart>) => void;
}) {
  const isDigital =
    part.method !== null &&
    (methods.find((m) => m.code === part.method)?.requiresVerification ?? false);
  const change =
    part.method === 'CASH' && part.cashReceived !== null
      ? Math.max(0, part.cashReceived - part.amount)
      : 0;
  const collected =
    part.method !== null &&
    (part.method === 'CASH'
      ? part.cashReceived !== null && part.cashReceived >= part.amount
      : part.verified);

  return (
    <div
      className={`space-y-2 rounded-md border p-3 ${
        collected ? 'border-success-border bg-success-bg/40' : 'border-border bg-card'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          Persona {part.index} {collected ? '✓' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {amountEditable ? (
            <div className="w-32">
              <MoneyInput
                prefix="$"
                placeholder="0"
                value={part.amount > 0 ? String(part.amount) : ''}
                onChange={(v) => onChange({ amount: Number(v) || 0 })}
                aria-label={`Monto de la persona ${part.index}`}
              />
            </div>
          ) : (
            <span className="text-base font-bold tabular-nums text-foreground">
              {formatCop(part.amount)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={part.method ?? ''}
          onChange={(e) =>
            onChange({
              method: (e.target.value || null) as PaymentMethod | null,
              cashReceived: null,
              verified: false,
            })
          }
          aria-label={`Método de pago de la persona ${part.index}`}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option value="">Método…</option>
          {methods.map((m) => (
            <option key={m.code} value={m.code}>
              {m.name}
            </option>
          ))}
        </select>

        {part.method === 'CASH' ? (
          <>
            <div className="w-32">
              <MoneyInput
                prefix="$"
                placeholder="Recibido"
                value={part.cashReceived !== null ? String(part.cashReceived) : ''}
                onChange={(v) => onChange({ cashReceived: v === '' ? null : Number(v) || 0 })}
                aria-label={`Efectivo recibido de la persona ${part.index}`}
              />
            </div>
            {change > 0 ? (
              <span className="text-sm font-medium text-success">
                Vuelto {formatCop(change)}
              </span>
            ) : null}
          </>
        ) : null}

        {isDigital ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={part.verified}
              onChange={(e) => onChange({ verified: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            Comprobante verificado
          </label>
        ) : null}
      </div>
    </div>
  );
}
