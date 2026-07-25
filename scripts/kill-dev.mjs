/**
 * Mata todo lo que quedó escuchando de una corrida anterior.
 *
 * Turbo levanta 5 procesos y, si uno queda huérfano, el siguiente `pnpm dev`
 * arranca a medias: los que encuentran su puerto libre suben y los demás
 * mueren con EADDRINUSE, casi sin avisar. El síntoma es peor que la causa —
 * media app funcionando, la otra media con 500.
 */
import { execSync } from 'node:child_process';

const PUERTOS = [
  { puerto: 3001, que: 'API' },
  { puerto: 3000, que: 'web' },
  { puerto: 3004, que: 'admin/caja' },
  { puerto: 3005, que: 'pantalla' },
  { puerto: 3006, que: 'cocina' },
  { puerto: 9120, que: 'print-agent' },
];

let matados = 0;
for (const { puerto, que } of PUERTOS) {
  try {
    const pids = execSync(`lsof -ti :${puerto}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().split('\n').filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        console.log(`  ✓ ${que} (:${puerto}) — pid ${pid}`);
        matados++;
      } catch { /* ya no estaba */ }
    }
  } catch { /* nadie escuchando */ }
}

// El turbo padre sigue vivo aunque sus hijos mueran: se lleva el siguiente run.
try {
  execSync('pkill -f "turbo run dev"', { stdio: 'ignore' });
} catch { /* no había */ }

console.log(matados === 0 ? '  (no había nada corriendo)' : `\n${matados} proceso(s) detenidos.`);
// Dar un respiro al SO para liberar los sockets antes de volver a bindear.
await new Promise((r) => setTimeout(r, 1500));
