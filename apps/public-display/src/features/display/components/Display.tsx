'use client';

import type { PublicDisplayState } from '@pos-tercos/types';
import { ConnectionDot } from '@pos-tercos/ui';
import { BrandLogo } from '@pos-tercos/brand';
import { useDisplayStream, type StreamConnection } from '../hooks/useDisplayStream';

const STATE_MAP: Record<StreamConnection, 'connecting' | 'live' | 'error'> = {
  connecting: 'connecting',
  live: 'live',
  reconnecting: 'error',
};

export function Display({ initial }: { initial: PublicDisplayState }) {
  const { state, connection } = useDisplayStream(initial);

  return (
    <div className="relative flex h-dvh w-dvw flex-col overflow-hidden bg-background text-foreground">
      {/* Marca + estado */}
      <div className="absolute left-8 top-8 flex items-center gap-3">
        <BrandLogo variant="full" theme="dark" size="h-10" />
      </div>
      <div className="absolute right-8 top-8 flex items-center gap-4">
        <TurnBadge value={state.currentTurn} />
        <ConnectionDot state={STATE_MAP[connection]} size="md" />
      </div>

      <CurrentSection current={state.current} />
      <NextSection next={state.next} />
    </div>
  );
}

function TurnBadge({ value }: { value: number }) {
  return (
    <div className="flex items-baseline gap-3 rounded-2xl border border-border bg-card px-5 py-3">
      <span className="caps text-[0.625rem] tracking-[0.3em] text-muted-foreground">
        Turno
      </span>
      <span className="font-display text-3xl font-extrabold tabular text-primary">
        #{value}
      </span>
    </div>
  );
}

function CurrentSection({ current }: { current: PublicDisplayState['current'] }) {
  if (!current) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="caps text-2xl text-muted-foreground tracking-[0.4em]">
          Preparando tu pedido…
        </p>
        <p className="mt-6 font-display text-3xl font-bold text-ink-300">
          Espera tu número en la pantalla
        </p>
      </section>
    );
  }
  return (
    <section className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="caps font-display text-3xl font-extrabold tracking-[0.5em] text-success">
        Listo
      </p>
      <p className="mt-6 font-display text-[12rem] font-black leading-none tabular text-foreground md:text-[18rem]">
        #{current.receiptNumber}
      </p>
      {current.customerName ? (
        <p className="mt-8 font-display text-3xl font-semibold text-foreground md:text-5xl">
          {current.customerName}
        </p>
      ) : null}
    </section>
  );
}

function NextSection({ next }: { next: PublicDisplayState['next'] }) {
  if (next.length === 0) {
    return <div className="h-32 bg-card" aria-hidden />;
  }
  return (
    <section className="border-t border-border bg-card px-12 py-6">
      <p className="caps text-sm tracking-[0.3em] text-muted-foreground">Próximos</p>
      <ul className="mt-4 flex justify-center gap-16">
        {next.map((o) => (
          <li key={o.saleId} className="text-center">
            <p className="font-display text-6xl font-extrabold tabular text-foreground">
              #{o.receiptNumber}
            </p>
            {o.customerName ? (
              <p className="mt-2 text-base font-semibold text-muted-foreground">
                {o.customerName}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
