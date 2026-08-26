export { ChecklistItemsPanel } from './components/ChecklistItemsPanel';
export { ChecklistHistoryPanel } from './components/ChecklistHistoryPanel';
export { IncidentsPanel } from './components/IncidentsPanel';
export { KitchenDaysTable } from './components/KitchenDaysTable';
export { KitchenPeopleTable } from './components/KitchenPeopleTable';
export { KitchenSummaryPanel } from './components/KitchenSummaryPanel';
// Server Component: hace el fetch de la pestaña activa. Solo lo consume la
// página (server) — si algún día lo importa un componente 'use client', el
// barril arrastraría next/headers y rompería el build.
export { KitchenTabContent } from './components/KitchenTabContent';
export { KitchenTabs, KITCHEN_TABS, type KitchenTab } from './components/KitchenTabs';
export { ProductionsTable } from './components/ProductionsTable';
export { WasteTable } from './components/WasteTable';
export { WorkerFilter, type WorkerOption } from './components/WorkerFilter';
