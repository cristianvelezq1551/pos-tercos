'use client';

import type { Stockable } from '@pos-tercos/types';
import { Button, NumberInput } from '@pos-tercos/ui';
import { useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../../lib/errors';
import { registerCount, stockableRef } from './api';
import {
  borradorUtilizable,
  borrarBorrador,
  cuantosContados,
  guardarBorrador,
  leerBorrador,
  soloItemsVigentes,
} from './borrador-conteo';
import { AvisoDeBorrador } from './AvisoDeBorrador';

/**
 * Conteo físico CIEGO: el cocinero ingresa lo que cuenta SIN ver el stock
 * esperado (no se muestra acá a propósito). Solo se envían los ítems con valor.
 *
 * Lo tecleado se guarda en el teléfono a cada cambio: contar la bodega toma un
 * rato y basta una recarga para perderlo todo. Pasó de verdad, a punto de
 * terminar. Al volver, el conteo sigue donde quedó.
 */
export function CountForm({ stockables, onDone }: { stockables: Stockable[]; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [retomado, setRetomado] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ counted: number; adjusted: number } | null>(null);
  const cargado = useRef(false);

  // Al abrir: retomar lo que haya quedado a medias, quitando lo que ya no está
  // en el catálogo. Solo una vez — después manda lo que se esté tecleando.
  useEffect(() => {
    if (cargado.current || stockables.length === 0) return;
    cargado.current = true;
    const borrador = leerBorrador();
    if (!borradorUtilizable(borrador, Date.now())) return;
    const vigentes = soloItemsVigentes(borrador!.valores, stockables.map((s) => s.id));
    if (cuantosContados(vigentes) === 0) return;
    setValues(vigentes);
    setRetomado(borrador!.guardadoEn);
  }, [stockables]);

  const cambiar = (id: string, texto: string) => {
    setValues((previos) => {
      const siguientes = { ...previos, [id]: texto };
      guardarBorrador(siguientes);
      return siguientes;
    });
  };

  const descartar = () => {
    borrarBorrador();
    setValues({});
    setRetomado(null);
  };

  const filledCount = cuantosContados(values);

  const submit = async () => {
    const items = stockables
      .filter((s) => (values[s.id] ?? '').trim() !== '')
      .map((s) => ({ ...stockableRef(s), countedQty: Number(values[s.id]) }))
      .filter((i) => Number.isFinite(i.countedQty) && i.countedQty >= 0);
    if (items.length === 0) return setError('Cuenta al menos un ítem.');
    setPending(true);
    setError(null);
    try {
      const r = await registerCount({ items });
      setResult(r);
      // Solo se borra el borrador cuando el servidor confirmó: si falla, lo
      // contado sigue ahí y se puede reintentar sin volver a la bodega.
      borrarBorrador();
      setValues({});
      setRetomado(null);
      onDone();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar el conteo'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Conteo a ciegas: cuenta lo que hay y escribe la cantidad. El administrador revisa y aprueba tu
        conteo antes de que ajuste el inventario — no te mostramos lo esperado.
      </p>

      <AvisoDeBorrador guardadoEn={retomado} contados={filledCount} onDescartar={descartar} />

      {result ? (
        <p className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success">
          Enviado: {result.counted} ítem(s) contados. Queda pendiente de aprobación del administrador.
        </p>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {stockables.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 bg-card px-3 py-2">
            <span className="min-w-0 truncate text-sm text-foreground">
              {s.name} <span className="text-xs text-muted-foreground">({s.unitStock})</span>
            </span>
            <NumberInput
              aria-label={`Cantidad contada de ${s.name}`}
              className="w-28 shrink-0"
              placeholder="—"
              decimals={4}
              min={0}
              value={(values[s.id] ?? '') === '' ? null : Number(values[s.id])}
              onChange={(v) => cambiar(s.id, v === null ? '' : String(v))}
            />
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button className="min-h-11 w-full" disabled={pending || filledCount === 0} onClick={() => void submit()}>
        {pending ? 'Registrando…' : `Registrar conteo (${filledCount})`}
      </Button>
    </div>
  );
}
