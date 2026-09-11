'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product, ProductAvailabilityWindowInput } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { setAvailabilityWindows } from '../api';
import { getErrorMessage } from '../../../lib/errors';

const DIAS: { mask: number; label: string }[] = [
  { mask: 1, label: 'L' },
  { mask: 2, label: 'M' },
  { mask: 4, label: 'X' },
  { mask: 8, label: 'J' },
  { mask: 16, label: 'V' },
  { mask: 32, label: 'S' },
  { mask: 64, label: 'D' },
];

type Fila = { daysMask: number; todoElDia: boolean; inicio: string; fin: string };

const filaVacia = (): Fila => ({ daysMask: 0, todoElDia: true, inicio: '11:00', fin: '22:00' });

const desdeProducto = (p: Product): Fila[] =>
  (p.availabilityWindows ?? []).map((w) => ({
    daysMask: w.daysOfWeekMask,
    todoElDia: w.timeStart === null,
    inicio: (w.timeStart ?? '11:00:00').slice(0, 5),
    fin: (w.timeEnd ?? '22:00:00').slice(0, 5),
  }));

/**
 * Los días y horas en que el producto se puede vender. Sin ninguna franja se
 * vende siempre, que es como está todo el catálogo: por eso quitar la última
 * es la salida cuando hay que venderlo un día que no toca.
 *
 * Guarda por su propio endpoint, como las variantes y los componentes del
 * combo — no viaja en el submit del formulario.
 */
export function ProductScheduleSection({ product }: { product: Product }) {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[]>(desdeProducto(product));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const tocar = (i: number, cambio: Partial<Fila>) => {
    setOk(false);
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
  };

  const sinDias = filas.some((f) => (f.daysMask & 127) === 0);
  const horaIgual = filas.some((f) => !f.todoElDia && f.inicio === f.fin);

  async function guardar() {
    setError(null);
    setOk(false);
    setGuardando(true);
    try {
      const windows: ProductAvailabilityWindowInput[] = filas.map((f) => ({
        daysOfWeekMask: f.daysMask,
        timeStart: f.todoElDia ? null : `${f.inicio}:00`,
        timeEnd: f.todoElDia ? null : `${f.fin}:00`,
      }));
      await setAvailabilityWindows(product.id, { windows });
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Cuándo se puede vender</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {filas.length === 0
          ? 'Se vende todos los días, a cualquier hora. Agrega una franja si solo se vende ciertos días (por ejemplo, un combo de miércoles).'
          : 'Fuera de estas franjas, el producto se ve pero no se puede agregar a un pedido. Quita todas para que vuelva a venderse siempre.'}
      </p>

      <ul className="mt-3 space-y-3">
        {filas.map((f, i) => (
          <li key={i} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d) => (
                <label
                  key={d.mask}
                  className={`min-h-[44px] min-w-[44px] cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                    (f.daysMask & d.mask) !== 0
                      ? 'border-primary bg-destructive/10 font-semibold text-primary'
                      : 'border-border bg-card text-foreground hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={(f.daysMask & d.mask) !== 0}
                    onChange={() => tocar(i, { daysMask: f.daysMask ^ d.mask })}
                  />
                  {d.label}
                </label>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={f.todoElDia}
                  onChange={(e) => tocar(i, { todoElDia: e.target.checked })}
                />
                Todo el día
              </label>
              {!f.todoElDia && (
                <>
                  <input
                    type="time"
                    aria-label="Hora de inicio"
                    value={f.inicio}
                    onChange={(e) => tocar(i, { inicio: e.target.value })}
                    className="min-h-[44px] rounded-md border border-border bg-card px-3 text-base text-foreground sm:text-sm"
                  />
                  <span className="text-sm text-muted-foreground">a</span>
                  <input
                    type="time"
                    aria-label="Hora de fin"
                    value={f.fin}
                    onChange={(e) => tocar(i, { fin: e.target.value })}
                    className="min-h-[44px] rounded-md border border-border bg-card px-3 text-base text-foreground sm:text-sm"
                  />
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setOk(false);
                  setFilas((fs) => fs.filter((_, j) => j !== i));
                }}
                className="ml-auto min-h-[44px] rounded-md px-3 text-sm font-medium text-destructive hover:underline"
              >
                Quitar
              </button>
            </div>
            {(f.daysMask & 127) === 0 && (
              <p className="mt-2 text-xs text-warning">Elige al menos un día.</p>
            )}
            {!f.todoElDia && f.inicio === f.fin && (
              <p className="mt-2 text-xs text-warning">
                La hora de fin no puede ser igual a la de inicio.
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setOk(false);
            setFilas((f) => [...f, filaVacia()]);
          }}
        >
          Agregar franja
        </Button>
        <Button type="button" onClick={guardar} disabled={guardando || sinDias || horaIgual}>
          {guardando ? 'Guardando…' : 'Guardar horario'}
        </Button>
        {ok && <span className="text-sm text-success">Horario guardado.</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </section>
  );
}
