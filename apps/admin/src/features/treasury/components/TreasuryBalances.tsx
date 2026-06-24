import type { PocketBreakdown, TreasurySummary } from '@pos-tercos/types';
import { Card, Money, Section, cn } from '@pos-tercos/ui';
import { Banknote, Landmark, Wallet } from 'lucide-react';

/** Panel de saldos: Efectivo, Cuenta, TOTAL + compromisos + proyectado. */
export function TreasuryBalances({ summary }: { summary: TreasurySummary }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <PocketCard
          title="Efectivo"
          icon={<Banknote className="h-5 w-5" strokeWidth={1.75} />}
          b={summary.cash}
          tone="primary"
        />
        <PocketCard
          title="En cuenta"
          icon={<Landmark className="h-5 w-5" strokeWidth={1.75} />}
          b={summary.bank}
          tone="default"
        />
        <Card variant="accent" tone="success" className="flex flex-col justify-center px-5 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wallet className="h-5 w-5" strokeWidth={1.75} />
            Total en caja
          </span>
          <Money amount={summary.total} size="3xl" weight="bold" className="mt-1" />
          <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
            <Row label="Compromisos por pagar" value={-summary.commitmentsTotal} muted />
            <Row label="Saldo proyectado" value={summary.projected} strong />
          </div>
        </Card>
      </div>

      {summary.commitmentsByResponsible.length > 0 ? (
        <Section eyebrow="Compromisos" title="Por pagar, por responsable" size="md">
          <Card className="px-5 py-3">
            <ul className="divide-y divide-border">
              {summary.commitmentsByResponsible.map((c) => (
                <li key={c.responsible} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-foreground">{c.responsible}</span>
                  <Money amount={c.total} size="sm" weight="semibold" />
                </li>
              ))}
              <li className="flex items-center justify-between py-2 text-sm font-bold">
                <span>Total compromisos</span>
                <Money amount={summary.commitmentsTotal} size="sm" weight="bold" />
              </li>
            </ul>
          </Card>
        </Section>
      ) : null}
    </div>
  );
}

function PocketCard({
  title,
  icon,
  b,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  b: PocketBreakdown;
  tone: 'primary' | 'default';
}) {
  return (
    <Card variant={tone === 'primary' ? 'accent' : 'default'} tone="none" className="px-5 py-4">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </span>
      <Money amount={b.balance} size="3xl" weight="bold" className="mt-1" />
      <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
        <Row label="Saldo inicial" value={b.initial} />
        <Row label="Ingresos" value={b.income} />
        <Row label="Gastos pagados" value={-b.expensesPaid} />
        {b.transfersIn > 0 ? <Row label="Traspasos recibidos" value={b.transfersIn} /> : null}
        {b.transfersOut > 0 ? <Row label="Traspasos enviados" value={-b.transfersOut} /> : null}
        {b.adjustments !== 0 ? <Row label="Ajustes" value={b.adjustments} /> : null}
      </div>
    </Card>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: number;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-between', muted && 'text-muted-foreground')}>
      <span>{label}</span>
      <span className={cn('tabular-nums', strong && 'font-bold text-foreground')}>
        <Money amount={value} size="xs" weight={strong ? 'bold' : 'medium'} />
      </span>
    </div>
  );
}
