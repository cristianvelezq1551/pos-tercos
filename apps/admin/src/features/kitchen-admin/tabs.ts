/**
 * Las pestañas del hub de cocina. Viven APARTE del componente porque la página
 * (Server Component) las recorre para resolver `?tab=`: un valor exportado
 * desde un módulo `'use client'` no llega al servidor como el dato, llega como
 * una referencia al cliente — en dev funciona y en el build de producción
 * revienta con `KITCHEN_TABS.find is not a function`.
 */
export const KITCHEN_TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'produccion', label: 'Producción' },
  { key: 'merma', label: 'Merma' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'incidencias', label: 'Incidencias' },
  { key: 'tareas', label: 'Tareas' },
] as const;

export type KitchenTab = (typeof KITCHEN_TABS)[number]['key'];
