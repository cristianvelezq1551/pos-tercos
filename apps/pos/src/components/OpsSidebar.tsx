'use client';

import { DayHistoryPanel } from '../features/sales';
import { TurnPanel } from '../features/turn';

/**
 * Barra lateral de operación del cajero: Turnos (arriba) e Historial (abajo)
 * SIEMPRE visibles a la vez — el cajero no se pierde un pedido listo por estar
 * mirando otra cosa. Cada sección tiene su propio scroll. Además TurnPanel hace
 * sonar una campana cuando entra un pedido nuevo a "Por llamar".
 * Visible desde lg; en pantallas chicas se accede por los botones del topbar.
 */
export function OpsSidebar() {
  return (
    <aside className="hidden h-full min-h-0 w-[clamp(310px,26vw,380px)] shrink-0 flex-col border-r border-border bg-muted/20 lg:flex">
      {/* Turnos — la zona crítica (llamar pedidos listos). */}
      <section className="flex min-h-0 flex-[5_1_0%] flex-col border-b border-border p-3">
        <h2 className="caps mb-2 shrink-0 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
          Turnos
        </h2>
        <div className="min-h-0 flex-1">
          <TurnPanel active />
        </div>
      </section>

      {/* Historial del día. */}
      <section className="flex min-h-0 flex-[6_1_0%] flex-col p-3">
        <h2 className="caps mb-2 shrink-0 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
          Historial del día
        </h2>
        <div className="min-h-0 flex-1">
          <DayHistoryPanel active />
        </div>
      </section>
    </aside>
  );
}
