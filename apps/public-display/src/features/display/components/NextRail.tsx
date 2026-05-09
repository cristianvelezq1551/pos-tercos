import type { PublicDisplayOrder, PublicDisplayState } from '@pos-tercos/types';
import { ProductThumbStack } from '@pos-tercos/brand';

export function NextRail({ next }: { next: PublicDisplayState['next'] }) {
  if (next.length === 0) return null;
  return (
    <section className="rounded-3xl border border-border bg-card/60 px-10 py-7 shadow-md backdrop-blur-sm">
      <p className="caps font-display text-2xl font-extrabold tracking-[0.45em] text-muted-foreground">
        En cola
      </p>
      <ul className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
        {next.map((order) => (
          <NextOrderCard key={order.saleId} order={order} />
        ))}
      </ul>
    </section>
  );
}

function NextOrderCard({ order }: { order: PublicDisplayOrder }) {
  return (
    <li className="flex items-center justify-between gap-6 rounded-2xl bg-background/40 px-6 py-4">
      <div className="min-w-0">
        <p className="font-display text-7xl font-extrabold leading-none tabular text-foreground">
          #{order.receiptNumber}
        </p>
        {order.customerName ? (
          <p
            className="mt-2 truncate text-3xl font-semibold text-muted-foreground"
            title={order.customerName}
          >
            {order.customerName}
          </p>
        ) : null}
      </div>
      {order.items.length > 0 ? (
        <ProductThumbStack
          items={order.items}
          size="sm"
          max={3}
          layout="row"
        />
      ) : null}
    </li>
  );
}
