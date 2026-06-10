import type { ExpandedCostResponse, Product, UserRole } from '@pos-tercos/types';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Money,
  type DataTableColumn,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import Link from 'next/link';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';
import { DeleteProductAction } from './DeleteProductAction';

interface ProductsTableProps {
  products: Product[];
  /** Costos pre-calculados por productId (FASE 4 ajustes 2.2). Si no
   *  está, fallback a lastUnitCost para direct-resale. */
  costsById?: Map<string, ExpandedCostResponse>;
  /** Rol del usuario actual. Solo Dueño puede modificar receta o eliminar. */
  userRole?: UserRole;
}

interface ProductRow {
  product: Product;
  salePrice: number;
  costPerStock: number | null;
  margin: number | null;
  costMissing: boolean;
  missingHint?: string;
}

export function ProductsTable({ products, costsById, userRole }: ProductsTableProps) {
  const canEditRecipe = userRole === 'DUENO';
  const canDelete = userRole === 'DUENO';
  const rows: ProductRow[] = products.map((p) => {
    const salePrice = p.isCombo ? (p.comboPrice ?? p.basePrice) : p.basePrice;
    const expanded = costsById?.get(p.id) ?? null;
    const costPerStock =
      expanded?.totalCost !== undefined && expanded?.totalCost !== null
        ? expanded.totalCost
        : computeCostPerStockUnit(p);
    const margin = computeMarginPct(salePrice, costPerStock);
    const costMissing = expanded?.totalCost === null;
    return {
      product: p,
      salePrice,
      costPerStock,
      margin,
      costMissing,
      missingHint: costMissing ? expanded.missingReasons.join(' · ') : undefined,
    };
  });

  const columns: DataTableColumn<ProductRow>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: ({ product }) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-foreground">{product.name}</span>
          {product.directResale ? (
            <Badge tone="info" size="sm" title="Producto de reventa directa: se compra y vende sin transformar.">
              reventa
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      hideOnMobile: true,
      cell: ({ product }) =>
        product.category ?? <span className="text-ink-300">—</span>,
    },
    {
      key: 'type',
      header: 'Tipo',
      hideOnMobile: true,
      cell: ({ product }) =>
        product.isCombo ? (
          <Badge tone="primary" size="sm">
            Combo
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Individual
          </Badge>
        ),
    },
    {
      key: 'salePrice',
      header: 'Precio venta',
      align: 'right',
      numeric: true,
      cell: ({ salePrice }) => <Money amount={salePrice} weight="semibold" />,
    },
    {
      key: 'costPerStock',
      header: <span title="Último costo unitario registrado al confirmar una factura.">Costo / u</span>,
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: ({ costPerStock, missingHint }) =>
        costPerStock !== null ? (
          <Money amount={costPerStock} weight="medium" />
        ) : (
          <span className="text-ink-300" title={missingHint ?? 'Sin información de costo'}>
            —
          </span>
        ),
    },
    {
      key: 'margin',
      header: <span title="Margen estimado = (precio de venta − costo) / precio de venta. Para reventa usa el último costo de compra; para preparados usa el costo de receta (último costo de cada insumo).">Margen %</span>,
      align: 'right',
      numeric: true,
      hideOnMobile: true,
      cell: ({ margin }) =>
        margin !== null ? (
          <MarginBadge value={margin} />
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: ({ product }) =>
        product.isActive ? (
          <Badge tone="success" size="sm">
            Activo
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            Inactivo
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: ({ product }) => (
        <span className="flex items-center justify-end gap-2">
          {canEditRecipe ? (
            <>
              <Link
                href={`/products/${product.id}/recipe`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Receta
              </Link>
              <span className="text-ink-300" aria-hidden>
                ·
              </span>
            </>
          ) : null}
          <Link
            href={`/products/${product.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Editar
          </Link>
          {canDelete ? <DeleteProductAction id={product.id} name={product.name} /> : null}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.product.id}
      columns={columns}
      emptyState={
        <EmptyState
          illustration={<LineArtIllustration name="empty-plate" />}
          title="Aún no tienes productos cargados"
          description="Productos son lo que vendes en mostrador (hamburguesas, combos, bebidas, etc.)."
          action={
            <Link href="/products/new">
              <Button>Crear primer producto</Button>
            </Link>
          }
        />
      }
    />
  );
}

function computeCostPerStockUnit(p: Product): number | null {
  if (!p.directResale) return null;
  if (p.lastUnitCost === null || p.lastUnitCost === undefined) return null;
  if (!p.conversionFactor || p.conversionFactor <= 0) return null;
  return p.lastUnitCost / p.conversionFactor;
}

function computeMarginPct(salePrice: number, costPerStock: number | null): number | null {
  if (costPerStock === null) return null;
  if (salePrice <= 0) return null;
  return ((salePrice - costPerStock) / salePrice) * 100;
}

function MarginBadge({ value }: { value: number }) {
  const tone = MARGIN_TONE_CLASS[marginTone(value)];
  return <span className={`tabular font-semibold ${tone}`}>{value.toFixed(1)}%</span>;
}
