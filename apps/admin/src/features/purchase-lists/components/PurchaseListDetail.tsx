'use client';

import type { PurchaseList } from '@pos-tercos/types';
import { PURCHASE_LIST_STATUS_LABELS } from '@pos-tercos/types';
import { Button, Money, StatusBadge, type StatusMapping } from '@pos-tercos/ui';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import {
  addItem,
  closePurchaseList,
  deletePurchaseList,
  removeItem,
  reviewWithAi,
  updateItem,
} from '../api';
import { AddItemPicker } from './AddItemPicker';
import { ListItemsTable } from './ListItemsTable';
import { PrintMenu } from './PrintMenu';

const STATUS_MAPPING: StatusMapping<PurchaseList['status']> = {
  DRAFT: { label: PURCHASE_LIST_STATUS_LABELS.DRAFT, tone: 'warning' },
  CLOSED: { label: PURCHASE_LIST_STATUS_LABELS.CLOSED, tone: 'neutral' },
};

export function PurchaseListDetail({ initial }: { initial: PurchaseList }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [pending, setPending] = useState<'close' | 'review' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editable = list.status === 'DRAFT';
  const yaEnLista = new Set(
    list.items.map((i) => `${i.entityType}:${i.ingredientId ?? i.productId}`),
  );

  /** Toda acción deja el estado que devuelve el servidor, no uno adivinado. */
  async function run<T>(
    kind: 'close' | 'review' | 'delete',
    fn: () => Promise<T>,
    onOk: (result: T) => void,
  ): Promise<void> {
    setPending(kind);
    setError(null);
    try {
      onOk(await fn());
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo completar la acción.'));
    }
    setPending(null);
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={list.status} mapping={STATUS_MAPPING} size="sm" />
        <span className="text-sm text-muted-foreground">
          Armada por {list.createdByName} el{' '}
          {new Date(list.createdAt).toLocaleString('es-CO')}
        </span>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Qué hay que comprar ({list.items.length})
          </h2>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Costo estimado</div>
            <div className="text-lg font-semibold text-foreground">
              <Money amount={list.estTotal} />
            </div>
            {list.itemsWithoutCost > 0 ? (
              <div className="text-xs text-warning">
                {list.itemsWithoutCost === 1
                  ? '1 ítem sin costo conocido: vas a pagar más'
                  : `${list.itemsWithoutCost} ítems sin costo conocido: vas a pagar más`}
              </div>
            ) : null}
          </div>
        </div>

        <ListItemsTable
          items={list.items}
          editable={editable}
          onChangeQty={async (itemId, quantity) => {
            setList(await updateItem(list.id, itemId, { quantity }));
          }}
          onRemove={async (itemId) => {
            setList(await removeItem(list.id, itemId));
          }}
        />
      </section>

      {editable ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Agregar a la lista</h2>
          <AddItemPicker
            yaEnLista={yaEnLista}
            onAdd={async (c) => {
              setList(
                await addItem(list.id, {
                  entityType: c.entityType,
                  entityId: c.entityId,
                  quantity: c.suggestedQty,
                }),
              );
            }}
          />
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            ¿Las cantidades alcanzan?
          </h2>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={pending !== null || list.items.length === 0}
            onClick={() =>
              void run('review', () => reviewWithAi(list.id), (r) => setList(r))
            }
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" strokeWidth={1.75} />
            {pending === 'review'
              ? 'Revisando…'
              : list.aiRationale
                ? 'Revisar otra vez'
                : 'Revisar con IA'}
          </Button>
        </div>
        {list.aiRationale ? (
          <div className="mt-3 space-y-2">
            <p className="rounded-md bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
              {list.aiRationale}
            </p>
            <p className="text-xs text-muted-foreground">
              <span title={list.aiModel ?? undefined}>Revisado por IA</span>
              {list.aiEvaluatedAt
                ? ` · ${new Date(list.aiEvaluatedAt).toLocaleString('es-CO')}`
                : ''}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            La IA compara lo que vas a comprar contra el mínimo y contra lo que consumiste en
            los últimos 30 días, y te dice en cuáles te vas a quedar corto.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Imprimir o guardar en PDF</h2>
        <PrintMenu listId={list.id} itemCount={list.items.length} />
      </section>

      {editable ? (
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            type="button"
            disabled={pending !== null}
            onClick={() =>
              void run<void>('delete', () => deletePurchaseList(list.id), () => {
                router.push('/purchase-lists');
                router.refresh();
              })
            }
          >
            {pending === 'delete' ? 'Borrando…' : 'Borrar borrador'}
          </Button>
          <Button
            type="button"
            disabled={pending !== null || list.items.length === 0}
            title="Marca la lista como pedida. Deja de editarse y queda en el historial."
            onClick={() =>
              void run('close', () => closePurchaseList(list.id), (r) => {
                setList(r);
                router.refresh();
              })
            }
          >
            {pending === 'close' ? 'Cerrando…' : 'Marcar como pedida'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Esta lista ya se pidió{list.closedByName ? ` (${list.closedByName})` : ''}. Queda como
          historial y no se edita. Crea una nueva para el próximo pedido.
        </p>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
