import {
  WebHeroSlideSchema,
  type UpdateWebHeroSlide,
  type WebHeroSlide,
} from '@pos-tercos/types';
import { z } from 'zod';

const SlideList = z.array(WebHeroSlideSchema);

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return res.json();
}

export async function listAds(): Promise<WebHeroSlide[]> {
  const res = await fetch('/api/web-hero/slides', { credentials: 'include' });
  return SlideList.parse(await jsonOrThrow(res));
}

export async function createAd(input: {
  media: File;
  linkUrl?: string;
}): Promise<WebHeroSlide> {
  const fd = new FormData();
  fd.append('media', input.media);
  if (input.linkUrl) fd.append('linkUrl', input.linkUrl);
  const res = await fetch('/api/web-hero/slides', {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  return WebHeroSlideSchema.parse(await jsonOrThrow(res));
}

export async function updateAd(
  id: string,
  body: UpdateWebHeroSlide,
): Promise<WebHeroSlide> {
  const res = await fetch(`/api/web-hero/slides/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return WebHeroSlideSchema.parse(await jsonOrThrow(res));
}

export async function replaceAdMedia(id: string, media: File): Promise<WebHeroSlide> {
  const fd = new FormData();
  fd.append('media', media);
  const res = await fetch(`/api/web-hero/slides/${id}/media`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  return WebHeroSlideSchema.parse(await jsonOrThrow(res));
}

export async function deleteAd(id: string): Promise<void> {
  const res = await fetch(`/api/web-hero/slides/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
}

export async function reorderAds(ids: string[]): Promise<WebHeroSlide[]> {
  const res = await fetch('/api/web-hero/slides/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
    credentials: 'include',
  });
  return SlideList.parse(await jsonOrThrow(res));
}
