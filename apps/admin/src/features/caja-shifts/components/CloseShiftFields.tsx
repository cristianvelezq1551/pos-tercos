'use client';

import type { Shift } from '@pos-tercos/types';
import {
  Checkbox,
  FormField,
  Input,
  LoadingSkeleton,
  NumberInput,
  cn,
  groupDigits,
} from '@pos-tercos/ui';
import { useState } from 'react';
import { sumBreakdown } from '../lib/denominations';
import {
  digitalDifference,
  missingDigitalCounts,
  type DigitalTarget,
} from '../lib/digital-arqueo';
import type { ShiftSummary } from '../lib/shift-summary';
import { DigitalCountSection } from './DigitalCountSection';
import { DenominationCounter } from './DenominationCounter';
import { DifferenceWidget } from './DifferenceWidget';
import { ShiftZReport } from './ShiftZReport';

/**
 * Cuerpo del cierre: Z-report, arqueo físico, arqueo digital, diferencia,
 * propinas y notas. El estado del conteo vive en CloseShiftModal porque el
 * submit lo necesita; el conteo ciego es solo presentación y vive acá.
 */
export function CloseShiftFields({
  loading,
  shift,
  summary,
  expectedCash,
  cashIn,
  cashOut,
  pending,
  arqueo,
  onArqueoChange,
  counts,
  onCountsChange,
  manual,
  onManualChange,
  digitalTargets,
  digitalCounts,
  onDigitalChange,
  tips,
  onTipsChange,
  notes,
  onNotesChange,
}: {
  loading: boolean;
  shift: Shift;
  summary: ShiftSummary | null;
  expectedCash: number | null;
  cashIn: number;
  cashOut: number;
  pending: boolean;
  arqueo: boolean;
  onArqueoChange: (value: boolean) => void;
  counts: Record<number, number>;
  onCountsChange: (counts: Record<number, number>) => void;
  manual: number | null;
  onManualChange: (value: number | null) => void;
  digitalTargets: DigitalTarget[];
  digitalCounts: Record<string, number | null>;
  onDigitalChange: (method: string, value: number | null) => void;
  tips: number | null;
  onTipsChange: (value: number | null) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}) {
  // Conteo ciego: opt-in. Por defecto se muestra el esperado; si el cajero lo
  // activa, se oculta hasta revelar (anti-sesgo).
  const [blind, setBlind] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const countedNum = arqueo ? sumBreakdown(counts) : (manual ?? 0);
  const hasCount = arqueo ? Object.values(counts).some((n) => n > 0) : manual !== null;
  const showResult = !blind || revealed;
  const difference = expectedCash !== null ? countedNum - expectedCash : 0;
  const accountDifference = digitalDifference(digitalTargets, digitalCounts);
  const missingAccount = missingDigitalCounts(digitalTargets, digitalCounts).length;

  return (
    <>
      {loading ? <LoadingSkeleton shape="text" count={5} /> : null}

      {/* Reporte de cierre: oculto en conteo ciego hasta revelar. */}
      {!loading && summary && showResult ? (
        <ShiftZReport
          shift={shift}
          summary={summary}
          expectedCash={expectedCash ?? 0}
          cashIn={cashIn}
          cashOut={cashOut}
        />
      ) : null}

      {/* Controles de arqueo / conteo ciego. */}
      {!loading && summary ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Checkbox
            checked={arqueo}
            onChange={(e) => onArqueoChange(e.target.checked)}
            label="Arqueo por denominación"
            disabled={pending}
          />
          <Checkbox
            checked={blind}
            onChange={(e) => {
              setBlind(e.target.checked);
              if (e.target.checked) setRevealed(false);
            }}
            label="Conteo ciego (no ver el esperado)"
            disabled={pending}
          />
        </div>
      ) : null}

      {!loading && summary ? (
        arqueo ? (
          <DenominationCounter counts={counts} onChange={onCountsChange} disabled={pending} />
        ) : (
          <FormField label="Efectivo contado físicamente (COP)" required>
            <NumberInput
              value={manual}
              onChange={onManualChange}
              prefix="$"
              grouping
              min={0}
              placeholder={showResult && expectedCash !== null ? groupDigits(String(expectedCash)) : '0'}
              disabled={pending}
              autoFocus
              required
            />
          </FormField>
        )
      ) : null}

      {/* Arqueo de cuenta: transferencias/Nequi según cada app. Obligatorio. */}
      {!loading && summary ? (
        <DigitalCountSection
          targets={digitalTargets}
          values={digitalCounts}
          onChange={onDigitalChange}
          showExpected={showResult}
          disabled={pending}
        />
      ) : null}

      {/* Diferencia: visible solo si no es ciego o ya se reveló. */}
      {!loading && summary && hasCount ? (
        showResult ? (
          <DifferenceWidget
            difference={difference}
            accountDifference={accountDifference}
            accountPending={missingAccount}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className={cn(
              'w-full rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50',
            )}
          >
            Conteo ciego activo · toca para revelar el esperado y la diferencia
          </button>
        )
      ) : null}

      <div>
        <FormField label="Propinas del día (efectivo aparte, opcional)">
          <NumberInput
            value={tips}
            onChange={onTipsChange}
            prefix="$"
            grouping
            min={0}
            placeholder="0"
            disabled={pending}
          />
        </FormField>
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          No suma al efectivo esperado de la caja — es el bote de propinas
          que se reparte entre los trabajadores.
        </p>
      </div>

      <FormField label="Notas (opcional)">
        <Input
          type="text"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Ej. faltan $5k del cambio del cliente Pedro"
          maxLength={500}
          disabled={pending}
        />
      </FormField>
    </>
  );
}
