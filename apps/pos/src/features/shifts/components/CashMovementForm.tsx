'use client';

import {
  PAYMENT_METHOD_LABELS,
  type CashMovementType,
  type PaymentMethod,
} from '@pos-tercos/types';
import { Button, Input, NumberInput, cn } from '@pos-tercos/ui';

/**
 * Form de registro/corrección de un movimiento de caja: tipo (entrada/salida),
 * método, monto y motivo. El estado vive en CashMovementsSection porque la
 * lista y el modo edición lo comparten.
 */
export function CashMovementForm({
  type,
  onTypeChange,
  method,
  onMethodChange,
  methods,
  amount,
  onAmountChange,
  reason,
  onReasonChange,
  valid,
  busy,
  editing,
  onSubmit,
  onCancel,
}: {
  type: CashMovementType;
  onTypeChange: (type: CashMovementType) => void;
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  methods: readonly PaymentMethod[];
  amount: number | null;
  onAmountChange: (value: number | null) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  valid: boolean;
  busy: boolean;
  editing: boolean;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="flex gap-1.5">
        <TypeButton active={type === 'OUT'} onClick={() => onTypeChange('OUT')} tone="danger">
          Salida
        </TypeButton>
        <TypeButton active={type === 'IN'} onClick={() => onTypeChange('IN')} tone="success">
          Entrada
        </TypeButton>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {methods.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMethodChange(m)}
            aria-pressed={method === m}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              method === m
                ? 'border-primary bg-destructive/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/40',
            )}
          >
            {PAYMENT_METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <NumberInput
          value={amount}
          onChange={onAmountChange}
          prefix="$"
          grouping
          min={0}
          placeholder="Monto"
          className="w-32 shrink-0"
        />
        <Input
          type="text"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder={type === 'OUT' ? 'Motivo (ej. pago proveedor)' : 'Motivo (ej. fondo de cambio)'}
          maxLength={200}
          className="flex-1"
        />
        <Button variant="secondary" disabled={!valid || busy} onClick={() => void onSubmit()}>
          {busy ? '…' : editing ? 'Guardar' : 'Registrar'}
        </Button>
        {editing ? (
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>

      {editing ? (
        <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
          Corrigiendo un movimiento — el cambio queda registrado en bitácora.
        </p>
      ) : null}
    </>
  );
}

function TypeButton({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: 'success' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
        active
          ? tone === 'success'
            ? 'bg-success/20 text-success'
            : 'bg-destructive/15 text-destructive'
          : 'bg-muted/40 text-muted-foreground hover:bg-ink-800',
      )}
    >
      {children}
    </button>
  );
}
