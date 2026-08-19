import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';

export function BreakEvenCard({ s }: { s: MonthlyFinancialStatement }) {
  // Margen de contribución negativo: cada venta pierde plata, así que no hay
  // volumen que cubra los fijos. Es un aviso distinto de "todavía no vendiste".
  if (s.contributionMarginPct !== null && s.contributionMarginPct <= 0) {
    return (
      <div className="space-y-2 rounded-2xl border border-destructive/40 bg-card p-5">
        <h2 className="font-display text-lg font-bold text-foreground">Punto de equilibrio</h2>
        <p className="text-sm text-destructive">
          Este mes no hay punto de equilibrio: lo que queda de cada venta después del costo de la
          comida, la merma, las cortesías y los reembolsos es{' '}
          <strong>{formatCop(s.contributionMargin)}</strong>. Vender más no te acerca a cubrir los
          costos fijos — primero hay que subir precios o bajar esos costos.
        </p>
      </div>
    );
  }

  if (s.breakEven === null || s.breakEvenCoverage === null) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold text-foreground">Punto de equilibrio</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No se puede calcular: hace falta tener ventas con margen para estimarlo. Cuando vendas algo
          este mes el cálculo se activa solo.
        </p>
      </div>
    );
  }

  const cov = Math.min(s.breakEvenCoverage, 1.5); // tope visual al 150%
  const pct = Math.round(s.breakEvenCoverage * 100);
  const covered = s.breakEvenCoverage >= 1;
  const missing = covered ? 0 : s.breakEven - s.revenue;
  const contribPct =
    s.contributionMarginPct !== null ? Math.round(s.contributionMarginPct * 100) : null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold text-foreground">Punto de equilibrio</h2>
      <p className="text-sm text-muted-foreground">
        Es el nivel de ventas que necesita el mes para cubrir los costos fijos recurrentes. Descuenta
        todo lo que sube cuando suben las ventas: el costo de la comida, la merma, las cortesías y
        los reembolsos. Los gastos puntuales quedan fuera (no se repiten), así que pueden dejar el
        mes en rojo aunque llegues al equilibrio.
      </p>

      <div className="space-y-2">
        {contribPct !== null && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">De cada $100 vendidos te quedan</span>
            <span className="font-bold tabular-nums">${contribPct}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Ventas necesarias del mes</span>
          <span className="font-bold tabular-nums">{formatCop(s.breakEven)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Llevas vendido</span>
          <span className="tabular-nums">{formatCop(s.revenue)}</span>
        </div>

        {/* Barra de progreso */}
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${covered ? 'bg-success' : 'bg-warning'}`}
            style={{ width: `${Math.min(100, (cov / 1.5) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Cobertura: <strong className={covered ? 'text-success' : 'text-warning'}>{pct}%</strong>
          {covered ? (
            <> · ya cubre los costos fijos recurrentes.</>
          ) : (
            <>
              {' '}
              · te faltan <strong>{formatCop(missing)}</strong> de ventas para llegar al equilibrio.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
