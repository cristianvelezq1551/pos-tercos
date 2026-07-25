import type { Product, ProductCostSummary, UserRole } from '@pos-tercos/types';
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
  /** Costos pre-calculados por productId (batch `/product-costs`). Si no
   *  está, fallback a lastUnitCost para direct-resale. */
  costsById?: Map<string, ProductCostSummary>;
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
      // "Estimado" no es un adorno: este número usa el ÚLTIMO precio de compra
      // de cada insumo, y el costo REAL de lo vendido sale por FIFO (el lote
      // más viejo primero), que puede ser otro. Sin la palabra, los dos
      // números se leen como una contradicción — pasó en el QA: la lista
      // decía $8.100 y el reporte de costos $7.100 para el mismo producto,
      // por un pan comprado antes más barato.
      header: (
        <span title="Estimado con el ÚLTIMO precio de compra de cada insumo. El costo REAL de lo que se vendió sale por FIFO (lote más viejo primero) y está en Reportes → Costos.">
          Costo est. / u
        </span>
      ),
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
      header: (
        <span title="Margen ESTIMADO = (precio de venta − costo estimado) / precio de venta. Usa el último precio de compra de cada insumo. El margen REAL de lo vendido está en Reportes → Costos.">
          Margen est. %
        </span>
      ),
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
