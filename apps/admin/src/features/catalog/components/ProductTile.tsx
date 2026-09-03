'use client';

import type { Product, ProductAvailability } from '@pos-tercos/types';
import { Money, cn, formatCop } from '@pos-tercos/ui';
import type { ProductPromoBadge } from '../../sales/lib/promo-preview';
import { displayBasePrice } from '../lib/display-price';

export function ProductTile({
  product,
  hideCategory = false,
  availability,
  manualSoldOut,
  forced,
  computedUnavailable,
  unavailable,
  reason,
  toggling,
  promo,
  onClick,
  onToggleSoldOut,
  onToggleForceAvailable,
}: {
  product: Product;
  /** En la vista agrupada el bloque ya dice la categoría: repetirla en cada
   *  tarjeta es ruido, y encima se truncaba ("PAPAS Y…"). */
  hideCategory?: boolean;
  availability: ProductAvailability | undefined;
  manualSoldOut: boolean;
  /** Forzado disponible por el dueño (pisa la falta de stock). */
  forced: boolean;
  /** Sin stock según el backend (insumo/subproducto no alcanza). */
  computedUnavailable: boolean;
  unavailable: boolean;
  reason: string | null;
  toggling: boolean;
  promo: ProductPromoBadge | null;
  onClick: () => void;
  onToggleSoldOut: () => void;
  onToggleForceAvailable: (next: boolean) => void;
}) {
  const hasVariants =
    (product.sizes && product.sizes.length > 0) ||
    (product.modifiersEnabled && product.modifiers && product.modifiers.length > 0);
  // Stock numérico solo aplica a reventa directa (bebidas, snacks).
  const stock = availability && availability.stock !== null ? availability.stock : null;
  const lowStock = stock !== null && stock > 0 && stock <= 3;
  // Mostrar el chip de promo solo si está disponible (si no, queda raro).
  const showPromo = promo !== null && !unavailable;

  // Control de disponibilidad manual, contextual al estado del producto:
  //  · 86 manual        → "Reactivar" (vuelve a automático)
  //  · forzado          → "Forzado"   (tocar para volver a automático)
  //  · agotado x stock   → "Forzar"    (vender aunque el stock no alcance)
  //  · normal            → "86"        (marcar agotado)
  const override = manualSoldOut
    ? {
        label: 'Reactivar',
        title: 'Reactivar producto (volver a automático)',
        onClick: onToggleSoldOut,
        tone: 'bg-success/20 text-success hover:bg-success/30',
      }
    : forced
      ? {
          label: 'Forzado',
          title: 'Forzado disponible — tocar para volver a automático',
          onClick: () => onToggleForceAvailable(false),
          tone: 'bg-warning/20 text-warning hover:bg-warning/30',
        }
      : computedUnavailable
        ? {
            label: 'Forzar',
            title: 'Forzar disponible (vender aunque el stock no alcance)',
            onClick: () => onToggleForceAvailable(true),
            tone: 'bg-success/20 text-success hover:bg-success/30',
          }
        : {
            label: '86',
            title: 'Marcar agotado (86)',
            onClick: onToggleSoldOut,
            tone: 'bg-ink-800 text-muted-foreground hover:bg-destructive/15 hover:text-destructive',
          };

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={onClick}
        disabled={unavailable}
        aria-disabled={unavailable}
        className={cn(
          'flex aspect-square w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          unavailable
            ? 'cursor-not-allowed opacity-45 saturate-0'
            : 'hover:border-border hover:bg-ink-800 active:scale-[0.98] motion-reduce:active:scale-100',
          'motion-reduce:transition-none',
        )}
      >
        {/* Categoría — deja hueco a la derecha para el botón 86. Cuando la
            grilla va en bloques, el encabezado ya la dice: acá queda el hueco
            para que el botón no se monte sobre el ícono. */}
        <span className="caps line-clamp-1 pr-9 text-[0.625rem] text-muted-foreground">
          {hideCategory ? '\u00a0' : (product.category ?? '')}
        </span>

        {/* Ícono para identificar el producto de un vistazo — arriba, tamaño
            moderado (no compite con el nombre ni el precio). */}
        {product.emoji ? (
          <span aria-hidden className="mt-1 text-[1.875rem] leading-none">
            {product.emoji}
          </span>
        ) : null}

        {/* Aire flexible → ancla el pie abajo y equilibra el cuadrado. */}
        <div className="min-h-0 flex-1" />

        {/* Pie: nombre + precio con el tag de descuento AL LADO. */}
        <div className="flex shrink-0 flex-col gap-1">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {product.name}
          </span>
          {/* Precio base tachado cuando hay descuento que reduce el precio. */}
          {showPromo && promo.discountedPrice !== null ? (
            <span className="text-[0.6875rem] leading-none text-muted-foreground line-through tabular-nums">
              {formatCop(displayBasePrice(product))}
            </span>
          ) : null}
          <div className="flex items-center gap-2">
            <Money
              amount={
                showPromo && promo.discountedPrice !== null
                  ? promo.discountedPrice
                  : displayBasePrice(product)
              }
              size="lg"
              weight="bold"
              className={
                showPromo && promo.discountedPrice !== null ? 'text-success' : 'text-foreground'
              }
            />
            {/* Tag de descuento — junto al precio. */}
            {showPromo ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide',
                  promo.kind === 'discount' ? 'bg-success/20 text-success' : 'bg-info/20 text-info',
                )}
              >
                {promo.label}
              </span>
            ) : null}
            {/* Stock de reventa: chip a la derecha. */}
            {stock !== null && !unavailable ? (
              <span
                className={cn(
                  'ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[0.625rem] font-bold tabular-nums',
                  lowStock ? 'bg-warning/20 text-warning' : 'bg-ink-800/80 text-muted-foreground',
                )}
              >
                {stock} u
              </span>
            ) : null}
          </div>
          {hasVariants ? (
            <span className="text-[0.6875rem] font-medium leading-4 text-muted-foreground">
              + opciones
            </span>
          ) : null}
        </div>
      </button>

      {/* AGOTADO + motivo.
          El velo cubre toda la tarjeta —es lo que dice "esto no se vende"—
          pero el sello va como CHIP en la esquina, no centrado. Centrado
          tapaba el nombre: en una tarjeta angosta se leía "AGOTADO / Sin
          stock" y debajo nada, así que el cajero no sabía QUÉ producto era el
          que no podía vender. La tarjeta es cuadrada, así que en celular mide
          ~118 px de alto: no hay franja libre encima del pie, y cualquier
          sello centrado o anclado arriba vuelve a chocar. Como chip el pie
          (nombre + precio) queda libre a cualquier tamaño.
          `forced` y `unavailable` no conviven —forzar existe justamente para
          poder venderlo— así que comparten la esquina sin pisarse, y el ancho
          se acota para no chocar con el botón de la esquina derecha. */}
      {unavailable ? (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-background/45" />
          <span className="pointer-events-none absolute left-2 top-2 flex max-w-[62%] flex-col items-start gap-0.5">
            <span className="rounded-md bg-destructive px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-destructive-foreground shadow">
              Agotado
            </span>
            {reason ? (
              <span className="line-clamp-2 rounded bg-background/85 px-1 py-0.5 text-[0.5625rem] font-semibold leading-tight text-foreground">
                {reason}
              </span>
            ) : null}
          </span>
        </>
      ) : null}

      {/* Chip "Forzado": el producto se vende pese a que el stock no alcanza
          (auto-agotado desactivado hasta volver a automático). */}
      {forced ? (
        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-warning/20 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-warning">
          Forzado
        </span>
      ) : null}

      {/* Control de disponibilidad manual (86 / reactivar / forzar). */}
      <button
        type="button"
        onClick={override.onClick}
        disabled={toggling}
        title={override.title}
        className={cn(
          'absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          toggling && 'opacity-50',
          override.tone,
        )}
      >
        {override.label}
      </button>
    </div>
  );
}
