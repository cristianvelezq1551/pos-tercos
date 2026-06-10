import { ManagedUserSchema, type ManagedUser } from '@pos-tercos/types';
import { z } from 'zod';
import { ApiError, serverFetchJson } from '../../lib/api-server';

export async function getUsersServer(): Promise<ManagedUser[] | { error: string }> {
  try {
    const data = await serverFetchJson<unknown>('/users');
    return z.array(ManagedUserSchema).parse(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.status === 403 ? 'Solo el Dueño puede gestionar usuarios.' : `API ${err.status}` };
    }
    return { error: 'No se pudo cargar la lista de usuarios.' };
  }
}
