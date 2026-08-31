/**
 * Reintenta `leer` hasta que devuelva algo, o se rinde.
 *
 * Hace falta para lo que el API dispara SIN esperar (`void this.x(...)`): los
 * avisos al dueño se mandan fire-and-forget para que un fallo del canal nunca
 * revierta la operación, así que su fila de auditoría se escribe DESPUÉS de
 * que la petición respondió. Un test que la lea de inmediato gana la carrera
 * en una máquina rápida y la pierde en CI — inestable, que es peor que rojo:
 * enseña a re-lanzar el CI en vez de mirar el fallo.
 *
 * Devuelve `null` al agotarse para que la aserción falle con el mensaje del
 * test, no con un timeout que no dice nada.
 */
export async function esperarHasta<T>(
  leer: () => Promise<T | null | undefined>,
  { intentos = 40, esperaMs = 50 }: { intentos?: number; esperaMs?: number } = {},
): Promise<T | null> {
  for (let i = 0; i < intentos; i++) {
    const valor = await leer();
    if (valor !== null && valor !== undefined) return valor;
    await new Promise((r) => setTimeout(r, esperaMs));
  }
  return null;
}
