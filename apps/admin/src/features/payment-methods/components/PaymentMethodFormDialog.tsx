'use client';

import type { PaymentMethodSetting } from '@pos-tercos/types';
import { Button, Dialog, Input, Label, Select, Switch } from '@pos-tercos/ui';
import { useState } from 'react';
import { createPaymentMethod, updatePaymentMethod } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

type Mode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: Mode;
  /** Método a editar (mode='edit'). */
  initial?: PaymentMethodSetting;
  onClose: () => void;
  onSaved: (m: PaymentMethodSetting) => void;
}

const RECON_OPTIONS = [
  { value: '', label: 'Ninguna' },
  { value: 'NEQUI_CSV', label: 'CSV de Nequi' },
  { value: 'BANCOLOMBIA_CSV', label: 'CSV de Bancolombia' },
] as const;

/** Crear un medio de pago custom (digital) o editar uno existente. */
export function PaymentMethodFormDialog({ open, mode, initial, onClose, onSaved }: Props) {
  const isCash = initial?.isCash ?? false;
  const [name, setName] = useState(initial?.name ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [requiresVerification, setRequiresVerification] = useState(
    initial?.requiresVerification ?? true,
  );
  const [reconciliationSource, setReconciliationSource] = useState<string>(
    initial?.reconciliationSource ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const recon = (reconciliationSource || null) as PaymentMethodSetting['reconciliationSource'];
      const saved =
        mode === 'create'
          ? await createPaymentMethod({
              name: trimmed,
              requiresVerification,
              reconciliationSource: recon,
              enabled,
            })
          : await updatePaymentMethod(initial!.code, {
              name: trimmed,
              enabled,
              ...(isCash ? {} : { requiresVerification, reconciliationSource: recon }),
            });
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title={mode === 'create' ? 'Nuevo medio de pago' : `Editar ${initial?.name}`}
      description={
        mode === 'create'
          ? 'Los métodos nuevos son digitales (verificación de comprobante + arqueo digital).'
          : undefined
      }
      maxWidth="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="pm-name">Nombre</Label>
          <Input
            id="pm-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Rappi, Bono regalo, Datáfono 2"
            autoFocus
          />
        </div>

        <Switch
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          label="Activo en el POS"
          description="Si está apagado, el cajero no lo ve al cobrar."
        />

        {isCash ? (
          <p className="text-xs text-muted-foreground">
            Efectivo es un método del sistema: maneja el cajón y el arqueo de billetes. Solo se
            puede renombrar o desactivar.
          </p>
        ) : (
          <>
            <Switch
              checked={requiresVerification}
              onChange={(e) => setRequiresVerification(e.target.checked)}
              label="Requiere verificar comprobante"
              description="El cajero confirma el comprobante antes de cerrar el cobro (recomendado en digitales)."
            />
            <div className="space-y-1.5">
              <Label htmlFor="pm-recon">Reconciliación con extracto</Label>
              <Select
                id="pm-recon"
                value={reconciliationSource}
                onChange={(e) => setReconciliationSource(e.target.value)}
              >
                {RECON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Contra qué CSV bancario se cruzan estos pagos en el reporte de reconciliación.
              </p>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
