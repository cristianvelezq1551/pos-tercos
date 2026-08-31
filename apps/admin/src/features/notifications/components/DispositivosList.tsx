import type { PushDevice } from '@pos-tercos/types';
import { Card } from '@pos-tercos/ui';
import { formatDate } from '../../../lib/format';

/**
 * Los dispositivos de esta persona. Sirve para notar lo que de otro modo no se
 * ve: un teléfono viejo que quedó suscrito y sigue recibiendo los avisos.
 */
export function DispositivosList({ devices }: { devices: PushDevice[] }) {
  if (devices.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="font-medium">Tus dispositivos con avisos</h2>
      <ul className="mt-3 divide-y divide-border text-sm">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2">
            <span>
              {d.label}
              {d.isCurrent && <span className="ml-2 text-xs text-emerald-400">este</span>}
            </span>
            <span className="text-xs text-ink-500">
              {d.lastSentAt ? `último aviso: ${formatDate(d.lastSentAt)}` : 'sin avisos todavía'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-500">
        Para quitar uno, abre esta pantalla en ese dispositivo y apaga el interruptor.
      </p>
    </Card>
  );
}
