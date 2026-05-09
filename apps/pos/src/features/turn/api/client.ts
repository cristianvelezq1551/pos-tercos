import {
  PublicDisplayStateSchema,
  TurnResponseSchema,
  type PublicDisplayState,
  type TurnResponse,
} from '@pos-tercos/types';

export async function getDisplayState(): Promise<PublicDisplayState> {
  const res = await fetch('/api/public-display/state', {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`getDisplayState failed: ${res.status}`);
  const json = (await res.json()) as unknown;
  return PublicDisplayStateSchema.parse(json);
}

export async function advanceTurn(): Promise<TurnResponse> {
  const res = await fetch('/api/public-display/turn/advance', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`advanceTurn failed: ${res.status}`);
  return TurnResponseSchema.parse(await res.json());
}

export async function setTurn(value: number): Promise<TurnResponse> {
  const res = await fetch('/api/public-display/turn', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`setTurn failed: ${res.status}`);
  return TurnResponseSchema.parse(await res.json());
}

export async function resetTurn(): Promise<TurnResponse> {
  const res = await fetch('/api/public-display/turn/reset', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`resetTurn failed: ${res.status}`);
  return TurnResponseSchema.parse(await res.json());
}
