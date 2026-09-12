/**
 * Topes de peticiones por IP, en un solo lugar.
 *
 * Los dos existen para lo mismo en producción: acotar el daño de un script. Y
 * los dos son ajustables por variable por la misma razón: los tests pegan TODOS
 * desde una sola IP y comparten un presupuesto, así que las suites del final
 * fallaban con 429 por vecindad y no por lo que probaban — el peor tipo de
 * rojo, porque enseña a relanzar el CI en vez de mirar el error.
 *
 * ⚠️ El default es SIEMPRE el valor real de producción, y cualquier valor
 * basura (cero, negativo, decimal, texto) cae a él: una variable mal escrita no
 * puede dejar la puerta abierta. Mismo criterio que
 * `WEB_ORDER_MAX_PER_IP_PER_DAY` (§7.v21).
 */

const PETICIONES_POR_MINUTO_POR_DEFECTO = 100;
const LOGINS_POR_MINUTO_POR_DEFECTO = 10;

function leerTope(valor: string | undefined, porDefecto: number): number {
  const raw = Number(valor);
  return Number.isInteger(raw) && raw > 0 ? raw : porDefecto;
}

/** Tope general por IP (`API_RATE_LIMIT_PER_MINUTE`, default 100). */
export function peticionesPorMinuto(): number {
  return leerTope(process.env.API_RATE_LIMIT_PER_MINUTE, PETICIONES_POR_MINUTO_POR_DEFECTO);
}

/** Anti-brute-force de la contraseña (`AUTH_LOGINS_PER_MINUTE`, default 10). */
export function loginsPorMinuto(): number {
  return leerTope(process.env.AUTH_LOGINS_PER_MINUTE, LOGINS_POR_MINUTO_POR_DEFECTO);
}
