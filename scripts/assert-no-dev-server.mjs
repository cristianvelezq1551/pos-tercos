/**
 * Frena `pnpm build` si hay un dev server escuchando.
 *
 * `next build` y `next dev` escriben en el MISMO `.next`. Compilar producción
 * con el dev levantado deja ese directorio mezclado: el navegador termina
 * pidiendo un chunk que no existe y la pantalla muere con
 * "Loading chunk app/(...)/page failed" — sin que haya nada roto en el código.
 *
 * Cuesta media hora entender que el problema no era la app. Ya nos pasó tres
 * veces (está anotado en CLAUDE.md), así que mejor que no compile.
 *
 * Escape para CI o para cuando sabés lo que hacés: ALLOW_BUILD_WITH_DEV=1.
 */
import { createConnection } from 'node:net';

/** Puertos de dev de las apps Next (los del `dev` de cada package.json). */
const PUERTOS = [
  { puerto: 3000, app: 'web' },
  { puerto: 3004, app: 'admin' },
  { puerto: 3005, app: 'public-display' },
  { puerto: 3006, app: 'cocina' },
];

const enUso = (puerto) =>
  new Promise((resolve) => {
    const socket = createConnection({ port: puerto, host: '127.0.0.1' });
    const cerrar = (resultado) => {
      socket.destroy();
      resolve(resultado);
    };
    socket.setTimeout(400);
    socket.once('connect', () => cerrar(true));
    socket.once('timeout', () => cerrar(false));
    socket.once('error', () => cerrar(false));
  });

if (process.env.ALLOW_BUILD_WITH_DEV === '1') process.exit(0);

const ocupados = [];
for (const p of PUERTOS) {
  if (await enUso(p.puerto)) ocupados.push(p);
}

if (ocupados.length > 0) {
  const lista = ocupados.map((o) => `${o.app} (:${o.puerto})`).join(', ');
  console.error(
    `\n✗ Hay un dev server corriendo: ${lista}\n\n` +
      '  `next build` y `next dev` comparten el directorio .next. Compilar ahora\n' +
      '  lo deja mezclado y la app empieza a fallar con "Loading chunk ... failed"\n' +
      '  aunque el código esté bien.\n\n' +
      '  Pará el dev (Ctrl+C en la terminal de `pnpm dev`) y volvé a compilar.\n' +
      '  Si de verdad querés compilar igual: ALLOW_BUILD_WITH_DEV=1 pnpm build\n',
  );
  process.exit(1);
}
