import type { DirectRecipeComponent, FifoLotsResponse } from '@pos-tercos/types';
import { formatCop, pluralizeUnit } from '@pos-tercos/ui';
import { formatRecipeNumber } from './RecipeTablePrimitives';

interface Tier {
  units: number;
  value: number | null;
}
interface Comp {
  name: string;
  per: number;
  unitRecipe: string;
  entityType: 'INGREDIENT' | 'SUBPRODUCT';
  stock: number;
  tiers: Tier[];
}

const TONES = [
  'bg-emerald-500/20 text-emerald-300',
  'bg-amber-500/20 text-amber-300',
  'bg-orange-500/20 text-orange-300',
  'bg-red-500/20 text-red-300',
];
const UNKNOWN_TONE = 'bg-muted text-muted-foreground';

/** Barra de tramos: ancho ∝ unidades, color ∝ valor (más barato = verde). */
function TierBar({ tiers }: { tiers: Tier[] }) {
  const rank = [...new Set(tiers.map((t) => t.value).filter((v): v is number => v !== null))].sort((a, b) => a - b);
  const tone = (v: number | null): string =>
    v === null ? UNKNOWN_TONE : TONES[Math.min(rank.indexOf(v), TONES.length - 1)]!;
  return (
    <div>
      <div className="flex h-7 overflow-hidden rounded-md">
        {tiers.map((t, i) => (
          <div
            key={i}
            style={{ flexGrow: t.units }}
            className={`flex min-w-[2.25rem] items-center justify-center ${tone(t.value)} ${i > 0 ? 'ml-0.5' : ''}`}
            title={`${t.units} uds · ${t.value === null ? 'sin costo' : `${formatCop(t.value)} c/u`}`}
          >
            <span className="text-[11px] font-bold tabular-nums">{t.units}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5">
        {tiers.map((t, i) => (
          <p key={i} style={{ flexGrow: t.units }} className="min-w-[2.25rem] text-center text-[11px] font-semibold text-foreground">
            {t.value === null ? 'sin costo' : `${formatCop(t.value)}`}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Tramos de costo POR UNIDAD del producto: combina todos los componentes y
 *  corta donde cualquiera cambia de lote (FIFO). */
function productTiers(comps: Comp[]): { tiers: Tier[]; maxUnits: number } {
  const totals = comps.map((c) => c.tiers.reduce((a, t) => a + t.units, 0));
  const maxUnits = Math.min(...totals);
  if (!Number.isFinite(maxUnits) || maxUnits <= 0) return { tiers: [], maxUnits: 0 };
  const costAt = (c: Comp, u: number): number | null => {
    let acc = 0;
    for (const t of c.tiers) {
      acc += t.units;
      if (u < acc) return t.value; // value ya es el aporte por unidad de ese tramo
    }
    return c.tiers.at(-1)?.value ?? null;
  };
  const bps = new Set<number>([maxUnits]);
  for (const c of comps) {
    let acc = 0;
    for (const t of c.tiers) {
      acc += t.units;
      if (acc < maxUnits) bps.add(acc);
    }
  }
  const tiers: Tier[] = [];
  let prev = 0;
  for (const bp of [...bps].sort((a, b) => a - b)) {
    let value: number | null = 0;
    for (const c of comps) {
      const v = costAt(c, prev);
      if (v === null) value = null;
      else if (value !== null) value += v;
    }
    tiers.push({ units: bp - prev, value });
    prev = bp;
  }
  return { tiers, maxUnits };
}

/**
 * Ayuda visual (solo lectura): con el stock y los lotes FIFO, cuánto cuesta cada
 * unidad del producto a medida que la hacés (lote viejo primero), y el aporte de
 * CADA componente directo (insumos y/o subproductos). No toca el costeo.
 */
export function FifoYieldBreakdown({
  directComponents,
  fifoLots,
}: {
  directComponents: DirectRecipeComponent[];
  fifoLots: FifoLotsResponse | null;
}) {
  if (!fifoLots) return null;
  const lotsByKey = new Map(fifoLots.entities.map((e) => [`${e.entityType}:${e.entityId}`, e.lots]));

  // TODOS los componentes directos, incluso los SIN stock (para que se vea cuál
  // bloquea el producto — ej. un subproducto que falta producir).
  const comps: Comp[] = directComponents
    .filter((c) => c.totalQuantity > 0)
    .map((c) => {
      const lots = lotsByKey.get(`${c.entityType}:${c.id}`) ?? [];
      return {
        name: c.name,
        per: c.totalQuantity,
        unitRecipe: c.unitRecipe,
        entityType: c.entityType,
        stock: lots.reduce((a, l) => a + l.qty, 0),
        tiers: lots
          .map((l) => ({
            units: Math.floor(l.qty / c.totalQuantity),
            value: l.unitCost === null ? null : c.totalQuantity * l.unitCost,
          }))
          .filter((x) => x.units > 0),
      };
    });

  if (comps.length === 0) return null;

  const unitsOf = (c: Comp): number => Math.floor(c.stock / c.per);
  const maxUnits = Math.min(...comps.map(unitsOf));
  const limiting = comps.reduce((min, c) => (unitsOf(c) < unitsOf(min) ? c : min), comps[0]!);
  const { tiers } = maxUnits > 0 ? productTiers(comps) : { tiers: [] as Tier[] };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Rendimiento de tu inventario</h3>
        <span className="text-xs text-muted-foreground">FIFO · lote más viejo primero</span>
      </div>

      <div>
        <p>
          <span className="font-display text-3xl font-bold tabular-nums text-foreground">{maxUnits}</span>
          <span className="ml-1.5 text-sm text-muted-foreground">
            unidades con tu stock <span className="text-muted-foreground/70">· limita {limiting.name}</span>
          </span>
        </p>
        {maxUnits > 0 && tiers.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Costo por unidad del producto</p>
            <TierBar tiers={tiers} />
          </div>
        ) : (
          <p className="mt-2 rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
            Todavía no podés vender este producto: {emptyHint(limiting)}.
          </p>
        )}
      </div>

      <div className="space-y-3 border-t border-border/60 pt-3">
        <p className="text-xs font-medium text-muted-foreground">Aporte de cada componente</p>
        {comps.map((c) => (
          <div key={c.name}>
            <p className="text-xs text-foreground">
              <strong>{c.name}</strong>{' '}
              <span className="text-muted-foreground">
                · {formatRecipeNumber(c.per)} {pluralizeUnit(c.unitRecipe, c.per)}/u · stock{' '}
                {formatRecipeNumber(c.stock)} {pluralizeUnit(c.unitRecipe, c.stock)}
              </span>
            </p>
            <div className="mt-1">
              {c.tiers.length > 0 ? (
                <TierBar tiers={c.tiers} />
              ) : (
                <p className="rounded-md bg-warning-bg/30 px-2 py-1 text-[11px] text-warning">
                  Sin stock — {emptyHint(c)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Cada cuadro = cuántas unidades del producto rinde ese lote y cuánto aporta a la unidad. El lote más viejo se
        consume primero; cuando se agota, el costo salta al siguiente.
      </p>
    </section>
  );
}

/** Acción para conseguir stock de un componente sin lotes. */
function emptyHint(c: { entityType: 'INGREDIENT' | 'SUBPRODUCT'; name: string }): string {
  return c.entityType === 'SUBPRODUCT'
    ? `producí una tanda de ${c.name}`
    : `registrá una compra de ${c.name}`;
}
