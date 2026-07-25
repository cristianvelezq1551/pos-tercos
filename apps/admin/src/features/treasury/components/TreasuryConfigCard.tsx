'use client';

import type { TreasuryConfig } from '@pos-tercos/types';
import { Button, Card, FormField, Input, MoneyInput } from '@pos-tercos/ui';
import { Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateTreasuryConfig } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/** "Celdas amarillas": fecha de corte + saldos iniciales de cada bolsillo. */
export function TreasuryConfigCard({ config }: { config: TreasuryConfig }) {
  const router = useRouter();
  const [anchor, setAnchor] = useState(config.anchorDate ?? '');
  const [cash, setCash] = useState(String(config.initialCash));
  const [bank, setBank] = useState(String(config.initialBank));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const save = async (): Promise<void> => {
    setError(null);
    setOk(false);
    setPending(true);
    try {
      await updateTreasuryConfig({
        anchorDate: anchor || null,
        initialCash: Number(cash) || 0,
        initialBank: Number(bank) || 0,
      });
      setOk(true);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Settings2 className="h-4 w-4 text-primary" strokeWidth={1.75} />
        Saldos iniciales
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Configura una vez desde qué fecha cuenta la tesorería y cuánto había en cada bolsillo ese día.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FormField label="Cuenta desde" hint="Vacío = todo el histórico">
          <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} disabled={pending} />
        </FormField>
        <FormField label="Efectivo inicial">
          <MoneyInput value={cash} onChange={setCash} disabled={pending} placeholder="0" />
        </FormField>
        <FormField label="Cuenta inicial">
          <MoneyInput value={bank} onChange={setBank} disabled={pending} placeholder="0" />
        </FormField>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar'}
        </Button>
        {ok ? <span className="text-xs text-success">Guardado.</span> : null}
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </Card>
  );
}
