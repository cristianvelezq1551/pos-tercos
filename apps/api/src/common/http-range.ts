import type { Request, Response } from 'express';

/**
 * Sirve un buffer honrando HTTP Range (206). Sin esto los `<audio>`/`<video>`
 * del browser no pueden hacer seeking (y Safari directamente no reproduce).
 * La porción se corta del buffer ya cargado en memoria.
 */
export function sendBufferWithRangeSupport(
  req: Request,
  res: Response,
  buffer: Buffer,
  opts: { mime: string; cacheControl: string },
): void {
  const total = buffer.length;
  res.setHeader('Content-Type', opts.mime);
  res.setHeader('Cache-Control', opts.cacheControl);
  res.setHeader('Accept-Ranges', 'bytes');

  const range = req.headers.range;
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match) {
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }
    const chunk = buffer.subarray(start, end + 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', chunk.length);
    res.end(chunk);
    return;
  }

  res.setHeader('Content-Length', total);
  res.end(buffer);
}
