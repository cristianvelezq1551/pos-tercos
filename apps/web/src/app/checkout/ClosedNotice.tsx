import type { PublicBusinessInfo } from '@pos-tercos/types';
import Link from 'next/link';
import { formatDayRanges, formatNextOpen, WEEKDAY_LABELS, WEEK_ORDER } from '../../features/business';

/**
 * Por qué no se puede pedir. Server Component: `formatNextOpen` solo formatea
 * el instante que ya calculó el server (no vuelve a decidir si está abierto).
 */
export function ClosedNotice({ business }: { business: PublicBusinessInfo }) {
  const paused = !business.webOrdersEnabled;
  const next = formatNextOpen(business.schedule.nextOpenAt);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 py-12 text-center text-foreground">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
        {paused ? 'Pedidos online pausados' : 'Estamos cerrados'}
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {paused
          ? 'Los pedidos por la web están temporalmente deshabilitados. ¡Te esperamos en el local!'
          : next
            ? `Abrimos ${next}. Tu carrito te espera hasta entonces.`
            : 'Volvé a intentar durante nuestro horario de atención.'}
      </p>

      {!paused ? (
        <ul className="w-full max-w-xs divide-y divide-border rounded-xl border border-border text-left">
          {WEEK_ORDER.map((day) => {
            const ranges = business.schedule.hours.weekly[day];
            return (
              <li key={day} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-muted-foreground">{WEEKDAY_LABELS[day]}</span>
                <span className="text-sm tabular-nums text-foreground">
                  {formatDayRanges(ranges)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Link
        href="/"
        className="-my-2 inline-flex min-h-11 items-center py-2 text-sm font-semibold text-primary hover:underline"
      >
        ← Volver al menú
      </Link>
    </div>
  );
}
