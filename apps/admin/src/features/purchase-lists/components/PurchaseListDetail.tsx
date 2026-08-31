'use client';

import type { PurchaseList } from '@pos-tercos/types';
import { PURCHASE_LIST_STATUS_LABELS } from '@pos-tercos/types';
import { BUSINESS_TIME_ZONE, Button, Money, StatusBadge, type StatusMapping } from '@pos-tercos/ui';
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
import { AiReviewSection } from './AiReviewSection';
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
  // Aparte del `error` de abajo: un fallo al editar un renglón se reporta JUNTO
  // a la tabla. El aviso del pie queda fuera de pantalla cuando la lista es
  // larga, que es justo cuando se editan cantidades.
  const [itemError, setItemError] = useState<string | null>(null);

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
          {new Date(list.createdAt).toLocaleString('es-CO', { timeZone: BUSINESS_TIME_ZONE })}
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
            setItemError(null);
            try {
              setList(await updateItem(list.id, itemId, { quantity }));
              return true;
            } catch (e) {
              setItemError(getErrorMessage(e, 'No se pudo cambiar la cantidad.'));
              return false;
            }
          }}
          onRemove={async (itemId) => {
            setItemError(null);
            try {
              setList(await removeItem(list.id, itemId));
            } catch (e) {
              setItemError(getErrorMessage(e, 'No se pudo quitar ese insumo de la lista.'));
            }
          }}
        />

        {itemError ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {itemError}
          </p>
        ) : null}
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

      <AiReviewSection
        list={list}
        disabled={pending !== null}
        reviewing={pending === 'review'}
        onReview={() =>
          void run(
            'review',
            () => reviewWithAi(list.id),
            (r) => setList(r),
          )
        }
      />

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
              void run<void>(
                'delete',
                () => deletePurchaseList(list.id),
                () => {
                  router.push('/purchase-lists');
                  router.refresh();
                },
              )
            }
          >
            {pending === 'delete' ? 'Borrando…' : 'Borrar borrador'}
          </Button>
          <Button
            type="button"
            disabled={pending !== null || list.items.length === 0}
            title="Marca la lista como pedida. Deja de editarse y queda en el historial."
            onClick={() =>
              void run(
                'close',
                () => closePurchaseList(list.id),
                (r) => {
                  setList(r);
                  router.refresh();
                },
              )
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
