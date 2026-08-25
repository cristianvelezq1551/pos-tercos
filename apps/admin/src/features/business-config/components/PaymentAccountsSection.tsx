'use client';

import type { BusinessConfig, PaymentAccount } from '@pos-tercos/types';
import { Button, FormField, Input } from '@pos-tercos/ui';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { updateBusinessConfig } from '../api/client';
import { useSectionDraft } from '../hooks/useSectionDraft';
import { SectionCard } from './SectionCard';

/** Tope del schema: más de 6 formas de pago nadie las lee en un chat. */
const MAX_ACCOUNTS = 6;

const VACIA: PaymentAccount = { label: '', value: '', note: '' };

/**
 * A dónde paga el cliente. Vivía en las variables de entorno del servidor
 * (`PAYMENT_INSTRUCTIONS_*`): cambiar de cuenta exigía entrar a Railway y
 * reiniciar el servicio.
 *
 * El número va en su propio campo, separado del rótulo, porque en el mensaje
 * de WhatsApp se imprime SOLO en su línea — así el cliente lo copia de un
 * toque en vez de arrastrar la selección con el dedo sobre un teléfono.
 */
export function PaymentAccountsSection({
  config,
  onSaved,
}: {
  config: BusinessConfig;
  onSaved: (c: BusinessConfig) => void;
}) {
  const { draft, setDraft, dirty, state, error, save } = useSectionDraft({
    initial: { paymentAccounts: config.paymentAccounts },
    toPatch: (d) => ({
      // Una fila a medio llenar no se guarda: el mensaje mostraría un rótulo
      // sin número (o al revés) y el cliente no sabría a dónde transferir.
      paymentAccounts: d.paymentAccounts.filter(
        (a) => a.label.trim() !== '' && a.value.trim() !== '',
      ),
    }),
    onSaved,
  });

  const cuentas = draft.paymentAccounts;
  const setCuentas = (paymentAccounts: PaymentAccount[]) => setDraft({ paymentAccounts });
  const editar = (i: number, patch: Partial<PaymentAccount>) =>
    setCuentas(cuentas.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <SectionCard
      title="Datos de pago"
      description="Se los mandas al cliente por WhatsApp y también los ve en la pantalla de su pedido."
      icon={<Wallet className="h-4 w-4" strokeWidth={2} />}
      onSave={() => void save(updateBusinessConfig)}
      state={state}
      error={error}
      dirty={dirty}
    >
      <div className="space-y-4">
        {cuentas.length === 0 ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Sin cuentas cargadas el cliente recibe el total pero no a dónde pagarlo.
          </p>
        ) : null}

        {cuentas.map((cuenta, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <FormField label="Nombre">
              <Input
                value={cuenta.label}
                onChange={(e) => editar(i, { label: e.target.value })}
                placeholder="Nequi"
                maxLength={60}
              />
            </FormField>
            <FormField label="Número">
              <Input
                value={cuenta.value}
                onChange={(e) => editar(i, { value: e.target.value })}
                placeholder="304 670 6847"
                maxLength={60}
                inputMode="numeric"
              />
            </FormField>
            <FormField label="A nombre de (opcional)">
              <Input
                value={cuenta.note}
                onChange={(e) => editar(i, { note: e.target.value })}
                placeholder="Tercos S.A.S."
                maxLength={120}
              />
            </FormField>
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Quitar ${cuenta.label || 'esta forma de pago'}`}
                onClick={() => setCuentas(cuentas.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4 text-destructive" strokeWidth={2} />
              </Button>
            </div>
          </div>
        ))}

        {cuentas.length < MAX_ACCOUNTS ? (
          <Button variant="outline" size="sm" onClick={() => setCuentas([...cuentas, VACIA])}>
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={2} />
            Agregar forma de pago
          </Button>
        ) : null}

        <p className="text-xs text-muted-foreground">
          El número le llega solo en su línea, sin nada alrededor, para que el cliente lo
          copie de un toque y no se equivoque de dígito.
        </p>
      </div>
    </SectionCard>
  );
}
