/**
 * El negocio es UNO y está en Colombia: toda fecha y hora que ve una persona
 * se muestra en la hora del local, sin importar dónde corra el código.
 *
 * Sin esto la hora la ponía el reloj del runtime, y eso produjo un error real:
 * el admin arma varias páginas en el SERVIDOR (Vercel corre en UTC), así que
 * una caja abierta a las 4:35 se leía "9:35". El mismo dato tampoco coincidía
 * entre servidor y navegador, que es una discrepancia de hidratación.
 *
 * Fijarla protege además del dispositivo con la zona horaria mal puesta: un
 * arqueo tiene que decir la hora del local, no la del celular del cajero.
 *
 * Esto es lo que se MUESTRA. El corte del día de negocio (4 am) y las ventanas
 * de los reportes son otra decisión y viven en `@pos-tercos/domain`
 * (`business-day.ts`) y en `apps/api/src/common/local-dates.ts`.
 */
export const BUSINESS_TIME_ZONE = 'America/Bogota';

/**
 * Un instante convertido a la HORA DE PARED del local.
 *
 * El `Date` que devuelve NO representa el mismo instante: representa los
 * números que un reloj de la pared del local estaría mostrando. Sirve para lo
 * que se decide con `getDay()`, `getHours()` y compañía —qué día es hoy, si la
 * promoción está en su franja— en código que también corre en el SERVIDOR.
 *
 * Hace falta porque Vercel corre en UTC y `TZ` es un nombre de variable
 * reservado allá: no se puede cambiar el reloj del runtime. Sin esto, después
 * de las 7 pm de Bogotá el servidor cree que ya es mañana, y una promo de
 * "viernes 5 a 11 pm" se evalúa contra la franja equivocada.
 *
 * Para MOSTRAR una fecha no se usa esto: se usa `timeZone: BUSINESS_TIME_ZONE`
 * en el formateador, que sí conserva el instante.
 */
export function businessWallClock(at: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const n = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);

  // `hour` sale como 24 a la medianoche con hour12:false — el constructor de
  // Date lo interpretaría como la 1 am del día siguiente.
  const hora = n('hour') % 24;
  return new Date(n('year'), n('month') - 1, n('day'), hora, n('minute'), n('second'));
}
