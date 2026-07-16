import { Container, PageHeader } from '@pos-tercos/ui';
import { LineChart } from 'lucide-react';
import {
  RangeFilter,
  SalesDetailList,
  SalesSummaryView,
} from '../../../../features/reports-sales';
import { serverFetchJson } from '../../../../lib/api-server';
import { friendlyApiError } from '../../../../lib/error-copy';
import {
  SaleSchema,
  SalesSummarySchema,
  ShiftSchema,
  type Sale,
  type SalesSummary,
  type Shift,
} from '@pos-tercos/types';
import { z } from 'zod';
import { requireRole } from '../../../../lib/guards';

/** Cajas ofrecidas en el selector de arqueo (las más recientes). */
const SHIFT_PICKER_LIMIT = 60;

interface PageProps {
  searchParams: Promise<{
    from?: string;
    to?: string;
    granularity?: string;
    /** Id de caja: si viene, el detalle lista ESA sesión en vez del rango. */
    shift?: string;
  }>;
}

async function loadSummary(
  from: string | undefined,
  to: string | undefined,
  granularity: string | undefined,
): Promise<SalesSummary | { error: string }> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (granularity) qs.set('granularity', granularity);
  const path = `/reports/sales-summary${qs.toString() ? `?${qs.toString()}` : ''}`;
  try {
    return await serverFetchJson(path, undefined, SalesSummarySchema);
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

async function loadDetail(
  from: string | undefined,
  to: string | undefined,
  shiftId: string | undefined,
): Promise<Sale[] | { error: string }> {
  const qs = new URLSearchParams();
  // Por arqueo la ventana de fechas no aplica: la caja manda (puede cruzar medianoche).
  if (shiftId) {
    qs.set('shift_id', shiftId);
  } else {
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
  }
  const path = `/reports/sales-detail${qs.toString() ? `?${qs.toString()}` : ''}`;
  try {
    // Cast: z.array(SaleSchema) diverge input/output por los defaults del schema
    // (isOpenTab, etc.); el output parseado ES Sale[].
    return await serverFetchJson(
      path,
      undefined,
      z.array(SaleSchema) as z.ZodType<Sale[]>,
    );
  } catch (err) {
    return { error: friendlyApiError(err) };
  }
}

/**
 * Cajas del rango elegido arriba (por `openedAt`), para el selector de arqueo.
 * Acotarlas al rango evita que el desplegable crezca sin techo con los meses.
 * Si falla, el selector queda vacío — no rompe el reporte.
 */
async function loadShifts(
  from: string | undefined,
  to: string | undefined,
): Promise<Shift[]> {
  const qs = new URLSearchParams({ limit: String(SHIFT_PICKER_LIMIT) });
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  try {
    return await serverFetchJson(
      `/shifts?${qs.toString()}`,
      undefined,
      z.array(ShiftSchema) as z.ZodType<Shift[]>,
    );
  } catch {
    return [];
  }
}

/**
 * Caja puntual por id. Se usa cuando la caja seleccionada quedó FUERA del rango
 * (el dueño movió las fechas con un arqueo elegido): sin esto el selector diría
 * "Por fecha" mientras la tabla sigue mostrando la caja.
 */
async function loadShiftById(id: string): Promise<Shift | undefined> {
  try {
    return await serverFetchJson(`/shifts/${id}`, undefined, ShiftSchema);
  } catch {
    return undefined;
  }
}

export default async function ReportsSalesPage({ searchParams }: PageProps) {
  // Reportes financieros: solo el Dueño (defensa en profundidad — el endpoint ya es @OnlyDueno).
  await requireRole(['DUENO']);
  const sp = await searchParams;
  const [result, detail] = await Promise.all([
    loadSummary(sp.from, sp.to, sp.granularity),
    loadDetail(sp.from, sp.to, sp.shift),
  ]);

  // Sin ?from/?to el backend aplica su default (7 días). El resumen reporta la
  // ventana que EFECTIVAMENTE usó, así que el selector la lee de ahí en vez de
  // duplicar la constante y quedar desincronizado si el default cambia.
  const shifts =
    'error' in result
      ? await loadShifts(sp.from, sp.to)
      : await loadShifts(result.periodFrom, result.periodTo);

  // La caja elegida puede no estar en el rango: se resuelve aparte para que el
  // selector y la banda de contexto siempre describan lo que la tabla muestra.
  const inRange = sp.shift ? shifts.find((s) => s.id === sp.shift) : undefined;
  const outOfRangeShift =
    sp.shift && !inRange ? await loadShiftById(sp.shift) : undefined;
  const selectedShift = inRange ?? outOfRangeShift;

  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Ventas y métodos de pago"
        description="Serie temporal y desglose por tipo de pedido y método de pago. Solo cuenta ventas pagadas."
        icon={<LineChart className="h-6 w-6" strokeWidth={1.75} />}
      />
      <Container size="7xl" padY="md">
        <div className="space-y-5">
          <RangeFilter showGranularity />
          {'error' in result ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              No se pudo cargar el reporte. {result.error}
            </p>
          ) : (
            <SalesSummaryView summary={result} />
          )}
          {'error' in detail ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              No se pudo cargar el detalle de ventas. {detail.error}
            </p>
          ) : (
            <SalesDetailList
              sales={detail}
              shifts={shifts}
              selectedShift={selectedShift}
              outOfRangeShift={outOfRangeShift}
            />
          )}
        </div>
      </Container>
    </>
  );
}
