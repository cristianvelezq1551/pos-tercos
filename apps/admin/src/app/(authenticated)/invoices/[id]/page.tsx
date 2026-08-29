import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, serverFetchJson } from '../../../../lib/api-server';
import {
  CloneInvoiceButton,
  DeleteDraftButton,
  EditFreightAction,
  InvoicePaymentSection,
} from '../../../../features/invoices';
import { getCurrentUserServer } from '../../../../features/auth/server';
import { Button, Container, PageHeader, formatCop } from '@pos-tercos/ui';
import type { Invoice, InventoryMovement } from '@pos-tercos/types';
import { StockableTypeBadge } from '../../../../components/StockableTypeBadge';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL: Record<Invoice['status'], string> = {
  PENDING_REVIEW: 'Pendiente revisión',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada',
};

const STATUS_TONE: Record<Invoice['status'], string> = {
  PENDING_REVIEW: 'bg-warning-bg/30 text-warning ring-warning-border',
  CONFIRMED: 'bg-success-bg/30 text-success ring-success-border',
  REJECTED: 'bg-destructive/10 text-destructive ring-destructive/30',
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  let invoice: Invoice;
  try {
    invoice = await serverFetchJson<Invoice>(`/invoices/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  // FASE 4 ajustes 2.6: cargar movements generados por esta factura
  // (solo si CONFIRMED — antes no hay movements). Tolera fallo silenciosamente.
  const movements: InventoryMovement[] =
    invoice.status === 'CONFIRMED'
      ? await serverFetchJson<InventoryMovement[]>(
          `/inventory/movements?source_type=invoice&source_id=${invoice.id}&limit=200`,
        ).catch(() => [])
      : [];

  const currentUser = await getCurrentUserServer();
  const isDueno = currentUser?.role === 'DUENO';
  // El Dueño gestiona el pago de cualquier factura; el Admin Operativo solo el
  // de las que él creó (así nadie más le toca su compra). Ver comprobante lo
  // puede cualquier admin. El backend hace el enforcement real.
  const canManagePayment =
    isDueno || (currentUser?.role === 'ADMIN_OPERATIVO' && invoice.uploadedById === currentUser.id);
  const canViewProof = currentUser?.role === 'DUENO' || currentUser?.role === 'ADMIN_OPERATIVO';

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title={invoice.supplierName ?? 'Sin proveedor'}
        description={STATUS_LABEL[invoice.status]}
        breadcrumbs={[
          { label: 'Facturas', href: '/invoices' },
          { label: invoice.invoiceNumber ?? invoice.id.slice(0, 8) },
        ]}
        actions={
          <>
            {invoice.status === 'PENDING_REVIEW' ? (
              <>
                <Link href={`/invoices/${invoice.id}/edit`}>
                  <Button>Continuar edición</Button>
                </Link>
                <DeleteDraftButton
                  invoiceId={invoice.id}
                  supplierName={invoice.supplierName ?? null}
                />
              </>
            ) : null}
            {invoice.status === 'CONFIRMED' ? (
              <CloneInvoiceButton sourceInvoiceId={invoice.id} />
            ) : null}
          </>
        }
      />
      <Container size="7xl" padY="md">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[invoice.status]}`}
            >
              {STATUS_LABEL[invoice.status]}
            </span>
          </div>

          <InvoicePaymentSection
            invoice={invoice}
            canManage={canManagePayment}
            canViewProof={canViewProof}
          />

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="Número factura" value={invoice.invoiceNumber ?? '—'} />
            <Card
              label="Total"
              value={invoice.total !== null ? formatCop(invoice.total) : '—'}
              // Con domicilio, el total solo no explica de dónde sale: se muestra
              // el desglose para que se vea qué parte fue mercancía.
              hint={
                invoice.freightAmount > 0 && invoice.total !== null
                  ? `${formatCop(invoice.total - invoice.freightAmount)} de mercancía + ${formatCop(invoice.freightAmount)} de domicilio`
                  : undefined
              }
              mono
            />
            <Card
              label="Domicilio"
              value={invoice.freightAmount > 0 ? formatCop(invoice.freightAmount) : 'Sin domicilio'}
              hint={
                invoice.freightAmount > 0
                  ? 'Gasto del mes. No encarece ningún producto.'
                  : undefined
              }
              mono={invoice.freightAmount > 0}
              // El flete no genera movimientos de inventario, así que es de lo
              // único que se puede corregir después de confirmar sin riesgo.
              action={<EditFreightAction invoice={invoice} />}
            />
            <Card label="IVA" value={invoice.iva !== null ? formatCop(invoice.iva) : '—'} mono />
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Auditoría
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <Row k="Subido por" v={invoice.uploadedByName ?? '—'} />
              <Row k="Subido en" v={formatDate(invoice.createdAt)} />
              {invoice.confirmedAt && (
                <>
                  <Row k="Confirmado por" v={invoice.confirmedByName ?? '—'} />
                  <Row k="Confirmado en" v={formatDate(invoice.confirmedAt)} />
                </>
              )}
              {/* Movido desde las tarjetas de arriba al entrar "Domicilio": el modelo
              que leyó la foto es procedencia del dato, no una cifra a destacar. */}
              <Row k="Leída por" v={invoice.aiModelUsed ?? '—'} />
              {invoice.notes && <Row k="Notas" v={invoice.notes} />}
            </dl>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Ítems ({invoice.items?.length ?? 0})
            </h2>
            {invoice.items && invoice.items.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <Th>Insumo</Th>
                        <Th>Descripción</Th>
                        <Th align="right">Cantidad</Th>
                        <Th>Unidad</Th>
                        <Th align="right">Precio unit.</Th>
                        <Th align="right">Total</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.items.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/40">
                          <Td>
                            <div className="flex flex-col leading-tight">
                              <span className="font-medium text-foreground">
                                {item.itemName ?? <span className="text-muted-foreground">—</span>}
                              </span>
                              {item.entityType && (
                                <StockableTypeBadge
                                  type={item.entityType === 'INGREDIENT' ? 'INGREDIENT' : 'PRODUCT'}
                                  size="sm"
                                />
                              )}
                            </div>
                          </Td>
                          <Td>
                            <span className="text-xs text-muted-foreground">
                              {item.descriptionRaw}
                            </span>
                          </Td>
                          <Td align="right" mono>
                            {formatNumber(item.quantity)}
                          </Td>
                          <Td>{item.unit}</Td>
                          <Td align="right" mono>
                            {formatCop(item.unitPrice)}
                          </Td>
                          <Td align="right" mono>
                            {formatCop(item.total)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-input bg-card p-6 text-center text-sm text-muted-foreground">
                La factura no tiene ítems registrados.
              </p>
            )}
          </section>

          {invoice.status === 'PENDING_REVIEW' && (
            <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-sm text-warning">
              Esta factura está como borrador. Usa{' '}
              <Link href={`/invoices/${invoice.id}/edit`} className="font-medium underline">
                Continuar edición
              </Link>{' '}
              para asociar cada ítem y confirmar. Al confirmar, el stock se descuenta y queda como
              histórico.
            </p>
          )}

          {invoice.status === 'CONFIRMED' && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Movimientos de stock generados ({movements.length})
              </h2>
              {movements.length === 0 ? (
                <p className="rounded-md border border-dashed border-input bg-card p-6 text-center text-sm text-muted-foreground">
                  Sin movimientos registrados (algo inesperado para una factura confirmada).
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <Th>Producto</Th>
                          <Th>Tipo</Th>
                          <Th align="right">Cambio</Th>
                          <Th>Notas</Th>
                          <Th align="right">Acción</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {movements.map((m) => {
                          const itemId =
                            m.entityType === 'INGREDIENT' ? m.ingredientId : m.productId;
                          const itemName = m.itemName;
                          return (
                            <tr key={m.id} className="hover:bg-muted/40">
                              <Td>
                                <span className="font-medium text-foreground">
                                  {itemName ?? '(eliminado)'}
                                </span>
                              </Td>
                              <Td>
                                <StockableTypeBadge
                                  type={m.entityType === 'INGREDIENT' ? 'INGREDIENT' : 'PRODUCT'}
                                  size="sm"
                                />
                              </Td>
                              <Td align="right" mono>
                                <span
                                  className={
                                    m.delta > 0 ? 'font-medium text-success' : 'text-destructive'
                                  }
                                >
                                  {m.delta > 0 ? '+' : ''}
                                  {formatNumber(m.delta)}
                                </span>
                              </Td>
                              <Td>
                                <span className="text-xs text-muted-foreground">
                                  {m.notes ?? '—'}
                                </span>
                              </Td>
                              <Td align="right">
                                {itemId ? (
                                  <Link
                                    href={`/inventory/${m.entityType.toLowerCase()}/${itemId}/adjust`}
                                    className="font-medium text-primary hover:underline"
                                  >
                                    Ver stock
                                  </Link>
                                ) : null}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {invoice.photoStorageKey && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Foto original
              </h2>
              <div className="rounded-lg border border-border bg-card p-4">
                <a
                  href={`/api/invoices/${invoice.id}/photo`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <img
                    src={`/api/invoices/${invoice.id}/photo`}
                    alt={`Foto de la factura ${invoice.invoiceNumber ?? invoice.id.slice(0, 8)}`}
                    className="max-h-96 rounded-md border border-border object-contain"
                  />
                </a>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Click para abrir en pestaña nueva (full size).
                </p>
              </div>
            </section>
          )}
        </div>
      </Container>
    </>
  );
}

function Card({
  label,
  value,
  hint,
  mono,
  action,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  mono?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-base font-semibold text-foreground ${mono ? 'tabular-nums' : ''}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="font-medium text-muted-foreground">{k}:</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
