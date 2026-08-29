import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runLedgerFifo, type LedgerFifo } from './run-ledger';
import { generateHistory } from '../test-support/ledger-histories';
import { rngFrom } from '../test-support/random';

/**
 * PRUEBA DE ORO del motor de costos.
 *
 * Congela el resultado exacto del replay sobre 300 historias aleatorias
 * generadas con semillas fijas. Cualquier cambio en `runLedgerFifo` que mueva
 * un solo decimal de un solo caso hace fallar este test.
 *
 * Existe por una razón puntual: agregar la ANULACIÓN de facturas obliga a tocar
 * el motor que hoy calcula bien el COGS, el inventario y las pérdidas de un
 * negocio en producción. La rama nueva reacciona a un `sourceType` que ninguna
 * de estas historias contiene, así que para toda la historia YA EXISTENTE el
 * código nuevo tiene que ser indistinguible del viejo. Esto lo prueba en vez
 * de prometerlo.
 *
 * Las historias cubren compras, ventas (incluidas las que dejan el stock en
 * negativo), producciones, mermas, cortesías, conteos físicos, sus reversas y
 * entradas sin costo conocido.
 *
 * Para regenerar el archivo a propósito —solo si el cambio de comportamiento
 * es DELIBERADO y está justificado—:
 *   LEDGER_GOLDEN_UPDATE=1 pnpm -F @pos-tercos/domain test ledger-golden
 */

const CASOS = 300;
const ARCHIVO = join(__dirname, 'ledger-golden.fixture.json');

/**
 * Serialización estable del resultado: Maps a listas ordenadas por clave y
 * números redondeados a 6 decimales (por debajo de eso solo hay ruido de coma
 * flotante, que variaría entre máquinas sin que el negocio cambie).
 */
function serializar(fifo: LedgerFifo): unknown {
  // `-0` normalizado a `0`: JSON no distingue el signo del cero y el archivo
  // de referencia volvería como `0` haciendo fallar la comparación sin que
  // nada del negocio haya cambiado.
  const num = (n: number): number => {
    const r = Math.round(n * 1e6) / 1e6;
    return Object.is(r, -0) ? 0 : r;
  };
  const porVenta = (m: Map<string, Map<string, { cost: number; qty: number; unknownQty: number; estimatedQty: number }>>) =>
    [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, porItem]) => [
        id,
        [...porItem.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([itemId, v]) => [itemId, num(v.cost), num(v.qty), num(v.unknownQty), num(v.estimatedQty)]),
      ]);

  return {
    ventasInsumo: porVenta(fifo.saleIngredientCost),
    ventasProducto: porVenta(fifo.saleProductCost),
    ventasSubproducto: porVenta(fifo.saleSubproductCost),
    merma: fifo.waste.map((w) => ({ ...w, cost: num(w.cost), unknownQty: num(w.unknownQty), estimatedCost: num(w.estimatedCost ?? 0) })),
    cortesias: fifo.cortesia.map((c) => ({ ...c, cost: num(c.cost), unknownQty: num(c.unknownQty), estimatedCost: num(c.estimatedCost ?? 0) })),
    faltantes: fifo.shrinkage.map((f) => ({ ...f, cost: num(f.cost), unknownQty: num(f.unknownQty), estimatedCost: num(f.estimatedCost ?? 0) })),
    restante: [...fifo.remaining.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, num(v.qty), num(v.value), num(v.unknownQty)]),
    lotes: Object.entries(fifo.endingLots)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, lotes]) => [k, lotes.map((l) => [l.movementId, num(l.qty), l.unitCost === null ? null : num(l.unitCost)])]),
    deudas: Object.entries(fifo.endingDebts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, ds]) => [k, ds.map((d) => [d.consumerId, num(d.qty), d.kind, d.estimatedUnitCost === null || d.estimatedUnitCost === undefined ? null : num(d.estimatedUnitCost)])]),
    ultimoCosto: Object.entries(fifo.endingLastKnownUnitCost)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, c]) => [k, num(c)]),
    replayCompleto: fifo.needsFullReplay,
  };
}

function calcular(): unknown[] {
  const salida: unknown[] = [];
  for (let seed = 1; seed <= CASOS; seed += 1) {
    const history = generateHistory(rngFrom(seed), {
      steps: 60,
      allowShortfall: true,
      allowUnknownCost: true,
      includeProduction: true,
      includeCorrections: seed % 3 === 0,
    });
    salida.push(serializar(runLedgerFifo(history.movements)));
  }
  return salida;
}

describe('motor de costos — prueba de oro', () => {
  it(`el resultado de ${CASOS} historias no cambió ni un decimal`, () => {
    const actual = calcular();

    if (process.env.LEDGER_GOLDEN_UPDATE === '1') {
      writeFileSync(ARCHIVO, `${JSON.stringify(actual, null, 0)}\n`);
      // Regenerar y "pasar" en la misma corrida no prueba nada: el test queda
      // marcado para que nadie confunda una regeneración con una verificación.
      throw new Error(
        'Archivo de referencia regenerado. Revisa el diff con git y vuelve a correr SIN LEDGER_GOLDEN_UPDATE.',
      );
    }

    const esperado: unknown[] = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
    expect(actual).toHaveLength(esperado.length);
    // Caso por caso: si algo cambia, el error dice QUÉ semilla reproducirlo.
    for (let i = 0; i < esperado.length; i += 1) {
      expect({ semilla: i + 1, resultado: actual[i] }).toEqual({
        semilla: i + 1,
        resultado: esperado[i],
      });
    }
  });
});
