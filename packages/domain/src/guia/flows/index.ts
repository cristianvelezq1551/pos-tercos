import type { Audience, FlowArea, GuideFlow } from '../types';
import { FLOW_ABRIR_CAJA, FLOW_ANULAR_REEMBOLSAR, FLOW_MOVIMIENTO_EFECTIVO } from './caja-dia';
import { FLOW_AGOTADO, FLOW_CORTESIA, FLOW_CUENTA_ABIERTA, FLOW_PEDIDO_WEB } from './caja-pedidos';
import { FLOW_INSUMO, FLOW_PROMOCION, FLOW_SUBPRODUCTO } from './catalogo-base';
import { FLOW_CERRAR_CAJA } from './cerrar-caja';
import { FLOW_COBRAR } from './cobrar';
import { FLOW_CHECKLIST, FLOW_INCIDENCIA } from './cocina-rutinas';
import { FLOW_ANULAR_MERMA, FLOW_DEUDAS, FLOW_PEDIR_PROVEEDOR } from './compras-inventario';
import { FLOW_REVISAR_CONTROL, FLOW_USUARIOS, FLOW_WEB_CLIENTE } from './config-control';
import { FLOW_CONTEO } from './conteo';
import { FLOW_COSTO_FIJO } from './costo-fijo';
import { FLOW_CREAR_PRODUCTO } from './crear-producto';
import { FLOW_COMPROMISO, FLOW_LEER_PYG, FLOW_NOMINA, FLOW_TESORERIA } from './dinero';
import { FLOW_FACTURA } from './factura-compra';
import { FLOW_MERMA } from './merma';
import { FLOW_PRODUCCION } from './produccion';

/**
 * Orden dentro de cada área: por frecuencia de uso, no por importancia. Arriba
 * lo que se hace todos los días, abajo lo que se hace una vez al mes. Quien
 * abre la lista con una duda concreta encuentra antes lo probable.
 */
export const FLOWS: readonly GuideFlow[] = [
  // Caja — lo que más se repite en el día
  FLOW_COBRAR,
  FLOW_ABRIR_CAJA,
  FLOW_CERRAR_CAJA,
  FLOW_MOVIMIENTO_EFECTIVO,
  FLOW_PEDIDO_WEB,
  FLOW_CUENTA_ABIERTA,
  FLOW_ANULAR_REEMBOLSAR,
  FLOW_CORTESIA,
  FLOW_AGOTADO,
  // Cocina
  FLOW_PRODUCCION,
  FLOW_MERMA,
  FLOW_CHECKLIST,
  FLOW_INCIDENCIA,
  // Inventario
  FLOW_CONTEO,
  FLOW_DEUDAS,
  FLOW_ANULAR_MERMA,
  // Compras
  FLOW_FACTURA,
  FLOW_PEDIR_PROVEEDOR,
  // Catálogo
  FLOW_CREAR_PRODUCTO,
  FLOW_INSUMO,
  FLOW_SUBPRODUCTO,
  FLOW_PROMOCION,
  // Dinero
  FLOW_LEER_PYG,
  FLOW_COSTO_FIJO,
  FLOW_NOMINA,
  FLOW_TESORERIA,
  FLOW_COMPROMISO,
  // Personal y control
  FLOW_USUARIOS,
  FLOW_WEB_CLIENTE,
  FLOW_REVISAR_CONTROL,
] as const;

export function findFlow(id: string): GuideFlow | undefined {
  return FLOWS.find((f) => f.id === id);
}

/** Los flujos que le tocan a una audiencia. */
export function flowsFor(audience: Audience): GuideFlow[] {
  return FLOWS.filter((f) => f.audience.includes(audience));
}

/** Agrupados por área, conservando el orden de `FLOWS` dentro de cada una. */
export function flowsByArea(audience?: Audience): { area: FlowArea; flows: GuideFlow[] }[] {
  const grupos = new Map<FlowArea, GuideFlow[]>();
  for (const f of FLOWS) {
    if (audience && !f.audience.includes(audience)) continue;
    const lista = grupos.get(f.area);
    if (lista) lista.push(f);
    else grupos.set(f.area, [f]);
  }
  return [...grupos].map(([area, flows]) => ({ area, flows }));
}
