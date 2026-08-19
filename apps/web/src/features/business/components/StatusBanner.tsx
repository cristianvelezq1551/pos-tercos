'use client';

import { Clock } from 'lucide-react';
import { useState } from 'react';
import { useBusiness } from '../store/business-store';
import { formatNextOpen } from '../lib/hours-text';
import { HoursModal } from './HoursModal';

/**
 * Aviso de por qué no se puede pedir. Dos motivos distintos, dos mensajes:
 * el kill-switch (#13) y estar fuera de horario. Si se acepta el pedido, no
 * muestra nada — un banner permanente sería ruido.
 */
export function StatusBanner() {
  const business = useBusiness((s) => s.business);
  const [hoursOpen, setHoursOpen] = useState(false);

  if (business.acceptingOrders) return null;

  const paused = !business.webOrdersEnabled;
  const next = formatNextOpen(business.schedule.nextOpenAt);

  return (
    <>
      <div className="mx-auto mt-6 max-w-2xl px-6">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-amber-500">
            {paused
              ? 'Los pedidos online están pausados por ahora. ¡Te esperamos en el local!'
              : next
                ? `Estamos cerrados. Abrimos ${next}.`
                : 'Estamos cerrados en este momento.'}
          </p>
          {!paused ? (
            <button
              type="button"
              onClick={() => setHoursOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-500 underline underline-offset-2 hover:text-amber-400"
            >
              <Clock className="h-3.5 w-3.5" strokeWidth={2} />
              Ver horarios
            </button>
          ) : null}
        </div>
      </div>
      <HoursModal open={hoursOpen} onClose={() => setHoursOpen(false)} />
    </>
  );
}
