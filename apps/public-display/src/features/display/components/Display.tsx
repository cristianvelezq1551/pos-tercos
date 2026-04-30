'use client';

import type { PublicDisplayState } from '@pos-tercos/types';
import { useDisplayStream, type StreamConnection } from '../hooks/useDisplayStream';

export function Display({ initial }: { initial: PublicDisplayState }) {
  const { state, connection } = useDisplayStream(initial);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-gray-950 text-white">
      <ConnectionDot state={connection} />
      <CurrentSection current={state.current} />
      <NextSection next={state.next} />
    </div>
  );
}

function CurrentSection({ current }: { current: PublicDisplayState['current'] }) {
  if (!current) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-3xl font-medium tracking-wider text-gray-500">
          Estamos preparando tu pedido…
        </p>
        <p className="mt-4 text-lg text-gray-700">Esperá tu número en la pantalla.</p>
      </section>
    );
  }
  return (
    <section className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-2xl font-medium uppercase tracking-[0.5em] text-emerald-400">
        Listo
      </p>
      <p className="mt-4 text-9xl font-black tabular-nums leading-none md:text-[14rem]">
        #{current.receiptNumber}
      </p>
      {current.customerName ? (
        <p className="mt-6 text-3xl font-medium text-gray-300 md:text-5xl">
          {current.customerName}
        </p>
      ) : null}
    </section>
  );
}

function NextSection({ next }: { next: PublicDisplayState['next'] }) {
  if (next.length === 0) {
    return <div className="h-32 bg-gray-900" aria-hidden />;
  }
  return (
    <section className="border-t border-gray-800 bg-gray-900 px-12 py-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">
        Próximos
      </p>
      <ul className="mt-3 flex justify-center gap-12">
        {next.map((o) => (
          <li key={o.saleId} className="text-center">
            <p className="text-5xl font-bold tabular-nums text-gray-200">
              #{o.receiptNumber}
            </p>
            {o.customerName ? (
              <p className="mt-1 text-sm font-medium text-gray-500">{o.customerName}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConnectionDot({ state }: { state: StreamConnection }) {
  const map = {
    connecting: 'bg-amber-500 animate-pulse',
    live: 'bg-emerald-500',
    reconnecting: 'bg-red-500 animate-pulse',
  } as const;
  return (
    <div
      className={`absolute right-4 top-4 h-2 w-2 rounded-full ${map[state]}`}
      title={state}
      aria-hidden
    />
  );
}
