'use client';

import type { FinancialAnalysis } from '@pos-tercos/types';
import { BUSINESS_TIME_ZONE, Button } from '@pos-tercos/ui';
import { AlertTriangle, CheckCircle2, Lightbulb, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { analyzeFinancial } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

interface Props {
  year: number;
  month: number;
}

const TONE_CLASS: Record<FinancialAnalysis['tono'], string> = {
  saludable: 'border-success/30 bg-success/5',
  atencion: 'border-warning-border bg-warning-bg/30',
  critico: 'border-destructive/30 bg-destructive/5',
};

const TONE_LABEL: Record<FinancialAnalysis['tono'], string> = {
  saludable: 'Saludable',
  atencion: 'Atención',
  critico: 'Crítico',
};

const BULLET_ICON: Record<'positivo' | 'vigilar' | 'accion', React.ReactNode> = {
  positivo: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />,
  vigilar: <AlertTriangle className="h-4 w-4 shrink-0 text-warning" strokeWidth={2} />,
  accion: <Lightbulb className="h-4 w-4 shrink-0 text-info" strokeWidth={2} />,
};

export function AiAnalysisCard({ year, month }: Props) {
  const [data, setData] = useState<FinancialAnalysis | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      setData(await analyzeFinancial(year, month));
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo generar el análisis.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={`space-y-3 rounded-2xl border p-5 ${data ? TONE_CLASS[data.tono] : 'border-border bg-card'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.75} />
          <h2 className="font-display text-lg font-bold text-foreground">Análisis con IA</h2>
          {data ? (
            <span className="caps rounded-full border border-border bg-card/60 px-2 py-0.5 text-[0.625rem] text-foreground">
              {TONE_LABEL[data.tono]}
            </span>
          ) : null}
        </div>
        <Button size="sm" onClick={handleAnalyze} disabled={pending}>
          {pending ? 'Analizando…' : data ? 'Volver a analizar' : 'Analizar el mes'}
        </Button>
      </div>

      {!data && !error ? (
        <p className="text-sm text-muted-foreground">
          La IA lee el estado financiero del mes + la tendencia y devuelve un titular, qué va bien,
          qué vigilar y la acción concreta a tomar. Cuesta una llamada — apretás cuando quieras (no
          se evalúa solo).
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <p className="text-base font-semibold text-foreground">{data.titular}</p>
          <ul className="space-y-2">
            {data.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                {BULLET_ICON[b.tipo]}
                <span>{b.texto}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-md border border-border bg-card/60 p-3">
            <p className="caps text-[0.625rem] text-muted-foreground">Siguiente paso sugerido</p>
            <p className="mt-1 text-sm text-foreground">{data.siguiente_paso}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {data.modelUsed} ·{' '}
            {new Date(data.generatedAt).toLocaleString('es-CO', { timeZone: BUSINESS_TIME_ZONE })}
          </p>
        </>
      ) : null}
    </div>
  );
}
