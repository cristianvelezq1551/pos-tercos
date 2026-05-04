import type { ExpandedCostResponse, Product } from '@pos-tercos/types';
import Link from 'next/link';

interface ProductsTableProps {
  products: Product[];
  /** Costos pre-calculados por productId (FASE 4 ajustes 2.2). Si no
   *  está, fallback a lastUnitCost para direct-resale. */
  costsById?: Map<string, ExpandedCostResponse>;
}

export function ProductsTable({ products, costsById }: ProductsTableProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-900">Aún no tenés productos cargados.</p>
        <p className="mt-1 text-sm text-gray-500">
          Productos son lo que vendés en mostrador (hamburguesas, combos, bebidas, etc.).
        </p>
        <Link
          href="/products/new"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          Crear primer producto
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Nombre</Th>
            <Th>Categoría</Th>
            <Th>Tipo</Th>
            <Th align="right">Precio venta</Th>
            <Th
              align="right"
              hint="Último costo unitario registrado al confirmar una factura. Vacío si nunca se cargó este producto en una factura."
            >
              Costo / u
            </Th>
            <Th
              align="right"
              hint="(Precio venta − Costo unitario) / Precio venta. Solo aplica a productos direct-resale con costo histórico."
            >
              Margen %
            </Th>
            <Th>Estado</Th>
            <Th align="right">Acciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {products.map((p) => {
            const salePrice = p.isCombo ? (p.comboPrice ?? p.basePrice) : p.basePrice;
            // Preferir el costo del endpoint expanded-cost (cubre combos +
            // recetas + direct-resale). Fallback al cálculo legacy si la
            // llamada falló para este producto.
            const expanded = costsById?.get(p.id) ?? null;
            const costPerStock =
              expanded?.totalCost !== undefined && expanded?.totalCost !== null
                ? expanded.totalCost
                : computeCostPerStockUnit(p);
            const margin = computeMarginPct(salePrice, costPerStock);
            const costMissing = expanded?.totalCost === null;
            const missingHint = costMissing
              ? expanded.missingReasons.join(' · ')
              : undefined;
            return (
              <tr key={p.id} className="transition-colors hover:bg-gray-50">
                <Td>
                  <span className="font-medium text-gray-900">{p.name}</span>
                  {p.directResale && (
                    <span
                      className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20"
                      title="Producto de reventa directa: se compra y se vende sin transformación."
                    >
                      reventa
                    </span>
                  )}
                </Td>
                <Td>{p.category ?? <span className="text-gray-400">—</span>}</Td>
                <Td>
                  {p.isCombo ? (
                    <Badge tone="combo">Combo</Badge>
                  ) : (
                    <Badge tone="muted">Individual</Badge>
                  )}
                </Td>
                <Td align="right" mono>
                  {formatPrice(salePrice)}
                </Td>
                <Td align="right" mono>
                  {costPerStock !== null ? (
                    <span title={expanded?.kind === 'combo' ? 'suma de componentes' : undefined}>
                      {formatPrice(costPerStock)}
                    </span>
                  ) : (
                    <span
                      className="text-gray-300"
                      title={missingHint ?? 'Sin información de costo'}
                    >
                      —
                    </span>
                  )}
                </Td>
                <Td align="right" mono>
                  {margin !== null ? (
                    <MarginBadge value={margin} />
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </Td>
                <Td>
                  {p.isActive ? (
                    <Badge tone="success">Activo</Badge>
                  ) : (
                    <Badge tone="muted">Inactivo</Badge>
                  )}
                </Td>
                <Td align="right">
                  <Link
                    href={`/products/${p.id}/recipe`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Receta
                  </Link>
                  <span className="mx-2 text-gray-300">·</span>
                  <Link
                    href={`/products/${p.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Editar
                  </Link>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Costo en unidad de venta (basePrice está por unidad de stock).
 * lastUnitCost está en `unit_purchase` (ej. $/caja) → dividir por conversionFactor.
 * Solo aplica a directResale.
 */
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

function Th({
  children,
  align,
  hint,
}: {
  children: React.ReactNode;
  align?: 'right';
  hint?: string;
}) {
  return (
    <th
      scope="col"
      title={hint}
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${hint ? 'cursor-help' : ''}`}
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
      className={`px-4 py-3 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'success' | 'muted' | 'combo';
}) {
  const map = {
    success: 'bg-green-50 text-green-700 ring-green-600/20',
    muted: 'bg-gray-100 text-gray-600 ring-gray-500/20',
    combo: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function MarginBadge({ value }: { value: number }) {
  const tone =
    value >= 30
      ? 'text-green-700'
      : value >= 10
        ? 'text-amber-700'
        : value >= 0
          ? 'text-orange-700'
          : 'text-red-700';
  return <span className={`font-medium ${tone}`}>{value.toFixed(1)}%</span>;
}

function formatPrice(amount: number): string {
  return amount.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}
