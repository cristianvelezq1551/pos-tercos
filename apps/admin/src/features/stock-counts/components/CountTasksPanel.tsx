'use client';

import type { CountTask, CreateStockCount, StockCount } from '@pos-tercos/types';
import { BUSINESS_TIME_ZONE, Button, Input } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StockableTypeBadge } from '../../../components/StockableTypeBadge';
import { formatNumber } from '../../../lib/format';
import { registerCount } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

interface CountTasksPanelProps {
  tasks: CountTask[];
}

/**
 * "Contá estos N hoy" — conteo CIEGO: el stock del ledger NO se muestra
 * hasta registrar (si el cajero ve el esperado, escribe el esperado).
 */
export function CountTasksPanel({ tasks }: CountTasksPanelProps) {
  const router = useRouter();
  const [results, setResults] = useState<Record<string, StockCount>>({});

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No hay ítems activos para contar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((t) => (
        <CountTaskRow
          key={`${t.entityType}:${t.entityId}`}
          task={t}
          result={results[`${t.entityType}:${t.entityId}`] ?? null}
          onRegistered={(count) => {
            setResults((prev) => ({ ...prev, [`${t.entityType}:${t.entityId}`]: count }));
            router.refresh();
          }}
        />
      ))}
    </div>
  );
}

function CountTaskRow({
  task,
  result,
  onRegistered,
}: {
  task: CountTask;
  result: StockCount | null;
  onRegistered: (count: StockCount) => void;
}) {
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const counted = Number(value);
    if (!Number.isFinite(counted) || counted < 0) {
      setError('Ingresa la cantidad contada (número ≥ 0).');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const input: CreateStockCount = {
        entityType: task.entityType,
        ...(task.entityType === 'INGREDIENT'
          ? { ingredientId: task.entityId }
          : task.entityType === 'PRODUCT'
            ? { productId: task.entityId }
            : { subproductId: task.entityId }),
        countedQty: counted,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      onRegistered(await registerCount(input));
    } catch (err) {
      setError(getErrorMessage(err, 'Error registrando el conteo.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <StockableTypeBadge type={task.entityType} size="sm" iconOnly />
        <div className="min-w-40 flex-1">
          <p className="font-medium text-foreground">{task.name}</p>
          <p className="text-xs text-muted-foreground">
            {task.lastCountedAt
              ? `Último conteo: ${new Date(task.lastCountedAt).toLocaleDateString('es-CO', { timeZone: BUSINESS_TIME_ZONE })}`
              : 'Nunca contado'}
          </p>
        </div>
        {result ? (
          <CountResult result={result} unit={task.unit} />
        ) : (
          <>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder={`Contado (${task.unit})`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-40"
              aria-label={`Cantidad contada de ${task.name}`}
              disabled={pending}
            />
            <Input
              placeholder="Nota (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-44"
              aria-label={`Nota del conteo de ${task.name}`}
              disabled={pending}
            />
            <Button onClick={submit} disabled={pending || value === ''}>
              {pending ? 'Registrando…' : 'Registrar'}
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CountResult({ result, unit }: { result: StockCount; unit: string }) {
  const diff = result.difference;
  const tone = diff === 0 ? 'text-emerald-400' : diff < 0 ? 'text-destructive' : 'text-amber-400';
  return (
    <p className="text-sm tabular-nums">
      <span className="text-muted-foreground">
        Contado {formatNumber(result.countedQty)} · ledger {formatNumber(result.ledgerQty)} {unit}{' '}
        →{' '}
      </span>
      <span className={`font-medium ${tone}`}>
        {diff === 0
          ? 'cuadra ✓'
          : `${diff > 0 ? '+' : ''}${formatNumber(diff)} ${unit} (${diff < 0 ? 'faltante' : 'sobrante'}, ajustado)`}
      </span>
    </p>
  );
}
