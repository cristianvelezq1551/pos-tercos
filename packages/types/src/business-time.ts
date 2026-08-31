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
