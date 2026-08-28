import type { Audience, GuideFlow } from '../types';
import { FLOW_CERRAR_CAJA } from './cerrar-caja';
import { FLOW_COBRAR } from './cobrar';
import { FLOW_CONTEO } from './conteo';
import { FLOW_COSTO_FIJO } from './costo-fijo';
import { FLOW_CREAR_PRODUCTO } from './crear-producto';
import { FLOW_FACTURA } from './factura-compra';
import { FLOW_MERMA } from './merma';
import { FLOW_PRODUCCION } from './produccion';

/**
 * Orden por frecuencia de uso, no por importancia: arriba lo que se hace todos
 * los días, abajo lo que se hace una vez al mes. Quien abre esta lista con una
 * duda concreta encuentra antes lo probable.
 */
export const FLOWS: readonly GuideFlow[] = [
  FLOW_COBRAR,
  FLOW_MERMA,
  FLOW_PRODUCCION,
  FLOW_CERRAR_CAJA,
  FLOW_FACTURA,
  FLOW_CONTEO,
  FLOW_CREAR_PRODUCTO,
  FLOW_COSTO_FIJO,
] as const;

export function findFlow(id: string): GuideFlow | undefined {
  return FLOWS.find((f) => f.id === id);
}

/** Los flujos que le tocan a una audiencia. */
export function flowsFor(audience: Audience): GuideFlow[] {
  return FLOWS.filter((f) => f.audience.includes(audience));
}
