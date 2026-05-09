'use client';

import * as React from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  /** Texto del botón confirmar. Default "Confirmar". */
  confirmLabel?: string;
  /** Texto del botón cancelar. Default "Cancelar". */
  cancelLabel?: string;
  /** Si true, usa variant destructive en confirmar. Default false. */
  destructive?: boolean;
  /** Disabled mientras pendiente. */
  pending?: boolean;
}

/**
 * Confirmación canónica. Reemplaza patrones inline de "¿Estás seguro?".
 *
 * Cuando `destructive`, el botón confirma queda en rojo (bg-destructive).
 * El botón cancelar siempre es ghost para que el usuario lea la consecuencia
 * antes de actuar.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  pending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={typeof description === 'string' ? description : undefined}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Procesando…' : confirmLabel}
          </Button>
        </>
      }
    >
      {typeof description !== 'string' && description ? description : null}
    </Dialog>
  );
}
ConfirmDialog.displayName = 'ConfirmDialog';
