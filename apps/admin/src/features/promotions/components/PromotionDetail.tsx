'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ConfirmDialog } from '@pos-tercos/ui';
import type { Product, Promotion } from '@pos-tercos/types';
import { getErrorMessage } from '../../../lib/errors';
import { usePromotionStatus } from './PromotionStatusBadge';
import { PromotionSummaryCard } from './PromotionSummaryCard';
import { deactivatePromotion, updatePromotion } from '../api';

interface PromotionDetailProps {
  promotion: Promotion;
  products: Product[];
}

export function PromotionDetail({ promotion, products }: PromotionDetailProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = usePromotionStatus(promotion);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const linkedProducts = promotion.productIds
    .map((id) => productMap.get(id))
    .filter((p): p is Product => p !== undefined);

  async function handleDeactivate() {
    setConfirmDeactivate(false);
    setBusy(true);
    setError(null);
    try {
      await deactivatePromotion(promotion.id);
      router.push('/promotions');
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  /** Encenderla otra vez sin tener que crear una promo nueva y repetir todo. */
  async function handleReactivate() {
    setBusy(true);
    setError(null);
    try {
      await updatePromotion(promotion.id, { isActive: true });
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {status && status.hint && (
        <p
          className={`rounded-lg border px-4 py-3 text-sm ${
            status.tone === 'success'
              ? 'border-success/30 bg-success/10 text-foreground'
              : status.tone === 'danger'
                ? 'border-destructive/30 bg-destructive/10 text-foreground'
                : 'border-warning/30 bg-warning/10 text-foreground'
          }`}
        >
          <span className="font-semibold">{status.label}.</span> {status.hint}
        </p>
      )}
      <PromotionSummaryCard promotion={promotion} statusLabel={status?.label ?? null} />

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Productos ({linkedProducts.length})
        </h2>
        {linkedProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin productos asociados.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {linkedProducts.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-sm"
              >
                <span>{p.name}</span>
                {p.isCombo && (
                  <span className="ml-auto text-xs text-purple-600">combo</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={() => router.push('/promotions')}>
          Volver al listado
        </Button>
        <div className="flex gap-2">
          {/* Editar también estando apagada: si no, corregir sus días u horario
              obligaba a crear una promo nueva y volver a escribir todo. */}
          <Button
            variant="outline"
            onClick={() => router.push(`/promotions/${promotion.id}/edit`)}
          >
            Editar
          </Button>
          {promotion.isActive ? (
            <Button
              variant="destructive"
              onClick={() => setConfirmDeactivate(true)}
              disabled={busy}
            >
              {busy ? 'Apagando…' : 'Apagar promoción'}
            </Button>
          ) : (
            <Button onClick={() => void handleReactivate()} disabled={busy}>
              {busy ? 'Encendiendo…' : 'Encender promoción'}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={handleDeactivate}
        title="¿Apagar la promoción?"
        description="Deja de descontar de inmediato. Puedes volver a encenderla desde esta misma pantalla."
        confirmLabel="Sí, apagar"
        destructive
        pending={busy}
      />
      <p className="text-xs text-muted-foreground">
        Puedes cambiarle los días, el horario, la vigencia, los productos y dónde aplica. El monto
        del descuento (el % o los pesos) queda fijo desde que se crea: para cambiarlo, apaga esta
        promoción y crea una nueva.
      </p>
    </div>
  );
}
