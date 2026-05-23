import {
  PublicDisplayStateSchema,
  ReadyToCallResponseSchema,
  TurnResponseSchema,
  type PublicDisplayState,
  type ReadyToCallResponse,
  type TurnResponse,
} from '@pos-tercos/types';

export async function getDisplayState(): Promise<PublicDisplayState> {
  const res = await fetch('/api/public-display/state', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`getDisplayState failed: ${res.status}`);
  return PublicDisplayStateSchema.parse(await res.json());
}

/** Cola "listos por llamar" del cajero. */
export async function getReadyToCall(): Promise<ReadyToCallResponse> {
  const res = await fetch('/api/public-display/ready-to-call', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`getReadyToCall failed: ${res.status}`);
  return ReadyToCallResponseSchema.parse(await res.json());
}

/** Llama un turno desde una venta lista (lo muestra en la pantalla pública). */
export async function callSale(saleId: string): Promise<TurnResponse> {
  const res = await fetch(`/api/public-display/call/${saleId}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`callSale failed: ${res.status}`);
  return TurnResponseSchema.parse(await res.json());
}

/** Llamado manual de un número arbitrario (corrección de desfase). */
export async function callManual(turn: number): Promise<TurnResponse> {
  const res = await fetch('/api/public-display/call-manual', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turn }),
  });
  if (!res.ok) throw new Error(`callManual failed: ${res.status}`);
  return TurnResponseSchema.parse(await res.json());
}

/** Marca el pedido entregado → sale de la cola. */
export async function deliver(saleId: string): Promise<void> {
  const res = await fetch(`/api/public-display/deliver/${saleId}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`deliver failed: ${res.status}`);
}

/** Limpia la pantalla pública. */
export async function resetTurn(): Promise<TurnResponse> {
  const res = await fetch('/api/public-display/turn/reset', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`resetTurn failed: ${res.status}`);
  return TurnResponseSchema.parse(await res.json());
}
