import {
  PublicDisplayStateSchema,
  type PublicDisplayState,
} from '@pos-tercos/types';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const EMPTY_STATE: PublicDisplayState = {
  currentTurn: null,
  callSeq: 0,
  asOf: new Date(0).toISOString(),
};

export async function getInitialDisplayState(): Promise<PublicDisplayState> {
  try {
    const res = await fetch(`${API_URL}/public-display/state`, { cache: 'no-store' });
    if (!res.ok) return EMPTY_STATE;
    const json = (await res.json().catch(() => null)) as unknown;
    const parsed = PublicDisplayStateSchema.safeParse(json);
    return parsed.success ? parsed.data : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}
