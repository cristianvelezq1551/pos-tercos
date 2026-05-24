// Empaqueta el print-agent en UN solo archivo (dist/agent.cjs), sin el
// monorepo. `usb` queda external: es un binario nativo opcional que SOLO se usa
// en macOS/Linux; en Windows se imprime por el spooler (PowerShell), sin nativo.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/agent.cjs',
  external: ['usb'],
  legalComments: 'none',
  banner: { js: '/* Tercos print-agent — bundle autónomo */' },
});

console.log('OK → dist/agent.cjs');
