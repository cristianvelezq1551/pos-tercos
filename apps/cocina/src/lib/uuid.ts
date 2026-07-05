/**
 * UUID v4 que funciona también en contextos NO seguros (HTTP por IP de LAN),
 * donde `crypto.randomUUID()` no existe (solo está en HTTPS o localhost).
 */
export function randomUUID(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return (
    h.slice(0, 4).join("") + "-" + h.slice(4, 6).join("") + "-" +
    h.slice(6, 8).join("") + "-" + h.slice(8, 10).join("") + "-" +
    h.slice(10, 16).join("")
  );
}
