'use client';

import { Button, FormField, Input } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateBusinessConfig } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/**
 * El campo para mover el día en que arranca el mes del negocio.
 *
 * Vive aparte de la tarjeta porque hoy NO se monta: el dueño decidió dejar el
 * mes fijo (ver `CAMBIAR_INICIO_DE_MES_HABILITADO` en @pos-tercos/types).
 * Se conserva entero —y con sus hooks acá adentro, no en la tarjeta— para que
 * reactivarlo sea cambiar esa constante y nada más.
 */
export function MonthCutoffEditor({ monthStartDay }: { monthStartDay: number }) {
  const router = useRouter();
  const [day, setDay] = useState(String(monthStartDay));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const parsed = Number(day);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 28;
  const dirty = parsed !== monthStartDay;

  const save = async (): Promise<void> => {
    if (!valid || !dirty) return;
    setError(null);
    setOk(false);
    setPending(true);
    try {
      await updateBusinessConfig({ monthStartDay: parsed });
      setOk(true);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <FormField
          label="Empieza el día"
          hint="1–28 (1 = mes calendario)"
          error={day !== '' && !valid ? 'Día inválido' : undefined}
        >
          <Input
            type="number"
            min={1}
            max={28}
            inputMode="numeric"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            disabled={pending}
            className="w-24"
          />
        </FormField>
        <Button onClick={save} disabled={pending || !valid || !dirty}>
          {pending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
      {ok && !dirty ? <p className="mt-2 text-xs text-success">Guardado. Recalculando…</p> : null}
    </>
  );
}
