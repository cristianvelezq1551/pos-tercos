import {
  DisplaySlideSchema,
  DisplayTrackSchema,
  type DisplaySlide,
  type DisplayTrack,
  type UpdateDisplaySlide,
} from '@pos-tercos/types';
import { z } from 'zod';
import { subirArchivoGrande } from '../../../lib/upload-directo';

const SlideList = z.array(DisplaySlideSchema);
const TrackList = z.array(DisplayTrackSchema);

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return res.json();
}

// ── Slides ───────────────────────────────────────────────────────────
export async function listSlides(): Promise<DisplaySlide[]> {
  const res = await fetch('/api/display/slides', { credentials: 'include' });
  return SlideList.parse(await jsonOrThrow(res));
}

export async function createSlide(input: {
  name: string;
  tag: string;
  price: string;
  description: string;
  image: File;
}): Promise<DisplaySlide> {
  const fd = new FormData();
  fd.append('name', input.name);
  fd.append('tag', input.tag);
  fd.append('price', input.price);
  fd.append('description', input.description);
  fd.append('image', input.image);
  const res = await fetch('/api/display/slides', {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  return DisplaySlideSchema.parse(await jsonOrThrow(res));
}

export async function updateSlide(id: string, body: UpdateDisplaySlide): Promise<DisplaySlide> {
  const res = await fetch(`/api/display/slides/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return DisplaySlideSchema.parse(await jsonOrThrow(res));
}

export async function replaceSlideImage(id: string, image: File): Promise<DisplaySlide> {
  const fd = new FormData();
  fd.append('image', image);
  const res = await fetch(`/api/display/slides/${id}/image`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  return DisplaySlideSchema.parse(await jsonOrThrow(res));
}

export async function deleteSlide(id: string): Promise<void> {
  const res = await fetch(`/api/display/slides/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
}

export async function reorderSlides(ids: string[]): Promise<DisplaySlide[]> {
  const res = await fetch('/api/display/slides/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
    credentials: 'include',
  });
  return SlideList.parse(await jsonOrThrow(res));
}

export async function importDefaults(): Promise<{ imported: number; skipped: boolean }> {
  const res = await fetch('/api/display/import-defaults', {
    method: 'POST',
    credentials: 'include',
  });
  return (await jsonOrThrow(res)) as { imported: number; skipped: boolean };
}

// ── Tracks ───────────────────────────────────────────────────────────
export async function listTracks(): Promise<DisplayTrack[]> {
  const res = await fetch('/api/display/tracks', { credentials: 'include' });
  return TrackList.parse(await jsonOrThrow(res));
}

/**
 * Sube una pista reportando progreso. El detalle de por qué no pasa por el
 * proxy de la app está en `subirArchivoGrande`.
 */
export async function createTrack(
  label: string,
  audio: File,
  onProgress?: (pct: number) => void,
): Promise<DisplayTrack> {
  const fd = new FormData();
  fd.append('label', label);
  fd.append('audio', audio);
  // Directo a la API: por el proxy, una canción de más de ~4,5 MB moría con un
  // 413 del propio Vercel antes de llegar al backend (que acepta 50 MB).
  const body = await subirArchivoGrande<unknown>({ ruta: 'display/tracks', form: fd, onProgress });
  return DisplayTrackSchema.parse(body);
}

export async function updateTrack(
  id: string,
  body: { label?: string; isActive?: boolean },
): Promise<DisplayTrack> {
  const res = await fetch(`/api/display/tracks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return DisplayTrackSchema.parse(await jsonOrThrow(res));
}

export async function deleteTrack(id: string): Promise<void> {
  const res = await fetch(`/api/display/tracks/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
}
