'use client';

import type { PaymentMethodSetting } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';

interface Props {
  method: PaymentMethodSetting;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const RECON_LABELS: Record<string, string> = {
  NEQUI_CSV: 'Nequi CSV',
  BANCOLOMBIA_CSV: 'Bancolombia CSV',
};

function Tag({ children, tone }: { children: React.ReactNode; tone: 'muted' | 'success' | 'info' }) {
  const cls =
    tone === 'success'
      ? 'border-success-border bg-success-bg text-success'
      : tone === 'info'
        ? 'border-info-border bg-info-bg text-info'
        : 'border-border bg-muted text-muted-foreground';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
  );
}

export function PaymentMethodRow({ method, busy, onToggle, onEdit, onDelete }: Props) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{method.name}</p>
          {method.enabled ? <Tag tone="success">activo en el POS</Tag> : null}
          <Tag tone="muted">{method.isCash ? 'Efectivo' : 'Digital'}</Tag>
          {method.isSystem ? <Tag tone="muted">Sistema</Tag> : null}
          {!method.isCash && method.requiresVerification ? (
            <Tag tone="info">Verifica comprobante</Tag>
          ) : null}
          {method.reconciliationSource ? (
            <Tag tone="info">{RECON_LABELS[method.reconciliationSource] ?? method.reconciliationSource}</Tag>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {method.isCash
            ? 'Billetes y monedas. Abre el cajón y entra al arqueo de efectivo.'
            : method.requiresVerification
              ? 'Digital. El cajero verifica el comprobante antes de confirmar.'
              : 'Digital. Sin verificación de comprobante.'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToggle} disabled={busy}>
          {method.enabled ? 'Deshabilitar' : 'Habilitar'}
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
          Editar
        </Button>
        {!method.isSystem ? (
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={busy}>
            Borrar
          </Button>
        ) : null}
      </div>
    </li>
  );
}
