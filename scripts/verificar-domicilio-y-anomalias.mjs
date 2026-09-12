/**
 * Batería contra un API DESPLEGADO (QA o producción) para el domicilio pagado
 * del cajón (§7.v71) y la vista de anomalías (§7.v72).
 *
 * Mide por DELTA, así que no depende del estado del entorno: toma una foto
 * antes, opera, compara, deshace y comprueba que todo volvió al valor exacto.
 * Lo que escribe son movimientos de caja de la caja ABIERTA, que se borran al
 * terminar; si algo falla a mitad, lo deja dicho para limpiarlo a mano.
 *
 *   API=https://api-qa-5833.up.railway.app \
 *   CAJERO=admin@qa.tercos.co CAJERO_PW=… \
 *   DUENO=auditor@qa.tercos.co DUENO_PW=… \
 *   node scripts/verificar-domicilio-y-anomalias.mjs
 *
 * El cajero tiene que ser el que ABRIÓ la caja: los endpoints de caja son de su
 * dueño (antifraude). El dueño se usa para tesorería y anomalías.
 */
const API = process.env.API ?? 'http://localhost:3001';
const MONTO = 9_500;
const OTRO_MONTO = 4_300;

let fallos = 0;
let hechos = 0;
const ok = (nombre, cond, extra = '') => {
  hechos++;
  if (!cond) fallos++;
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}${extra ? ` → ${extra}` : ''}`);
};
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

async function login(email, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-App': 'admin' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login de ${email}: ${r.status}`);
  return (await r.json()).accessToken;
}

const pedir = (token) => async (ruta, init = {}) => {
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Client-App': 'admin',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const texto = await r.text();
  let cuerpo = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  return { status: r.status, body: cuerpo };
};

async function main() {
  const cajero = pedir(await login(process.env.CAJERO, process.env.CAJERO_PW));
  const dueno = pedir(await login(process.env.DUENO, process.env.DUENO_PW));

  const estado = await cajero('/shifts/current-status');
  const turno = estado.body?.shift;
  if (!turno || turno.status !== 'OPEN') {
    throw new Error('No hay caja abierta: esta batería necesita una para operar.');
  }
  const S = turno.id;
  console.log(`\nAPI: ${API}\nCaja abierta: ${S} (${turno.cashierName})\n`);

  const esperado = async () => (await cajero(`/shifts/${S}/expected-cash`)).body;
  const transfer = (e) => e.digital?.find((d) => d.method === 'TRANSFER')?.expected ?? 0;
  const bolsillos = async () => (await dueno('/treasury/summary')).body;
  const hoy = new Date();
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ventas = async () =>
    (await dueno(`/reports/sales-summary?from=${ymd(hoy)}&to=${ymd(hoy)}`)).body?.totals ?? {};
  const pyg = async () =>
    (await dueno(`/reports/financial/monthly?year=${hoy.getFullYear()}&month=${hoy.getMonth() + 1}`))
      .body ?? {};

  const antes = {
    esperado: await esperado(),
    bolsillos: await bolsillos(),
    ventas: await ventas(),
    pyg: await pyg(),
  };

  console.log('== Validaciones de entrada');
  for (const [nombre, cuerpo] of [
    ['monto cero', { amount: 0 }],
    ['monto negativo', { amount: -1000 }],
    ['sin monto', {}],
    ['monto que no es número', { amount: 'mucho' }],
    ['nota de dos letras', { amount: MONTO, note: 'ab' }],
  ]) {
    const r = await cajero(`/shifts/${S}/delivery-payout`, {
      method: 'POST',
      body: JSON.stringify(cuerpo),
    });
    ok(`rechaza ${nombre}`, r.status === 400, `HTTP ${r.status}`);
  }
  const inexistente = await cajero(
    `/shifts/${S}/delivery-payout/00000000-0000-4000-8000-000000000000`,
    { method: 'DELETE' },
  );
  ok('borrar un domicilio que no existe da "no encontrado"', inexistente.status === 404, `HTTP ${inexistente.status}`);

  console.log('\n== Registrar');
  const creado = await cajero(`/shifts/${S}/delivery-payout`, {
    method: 'POST',
    body: JSON.stringify({ amount: MONTO, note: 'verificacion automatica' }),
  });
  ok('el registro responde', creado.status === 201, `HTTP ${creado.status}`);
  if (creado.status !== 201) throw new Error('sin registro no se puede seguir');
  const patas = creado.body;
  const pairId = patas[0].pairId;
  const salida = patas.find((m) => m.type === 'OUT');
  const entrada = patas.find((m) => m.type === 'IN');
  ok('son dos patas con el mismo identificador', patas.length === 2 && patas.every((m) => m.pairId === pairId));
  ok('la salida es de efectivo', salida?.method === 'CASH' && Number(salida.amount) === MONTO);
  ok('la entrada es de transferencia', entrada?.method === 'TRANSFER' && Number(entrada.amount) === MONTO);
  ok('las dos quedan marcadas como domicilio', patas.every((m) => m.purpose === 'DELIVERY_PAYOUT'));

  console.log('\n== Efecto en los tres libros');
  const conDomicilio = await esperado();
  ok(
    'el cajón deja de esperar esa plata',
    cerca(conDomicilio.expectedCash, antes.esperado.expectedCash - MONTO),
    `${antes.esperado.expectedCash} → ${conDomicilio.expectedCash}`,
  );
  ok(
    'la cuenta sí la espera',
    cerca(transfer(conDomicilio), transfer(antes.esperado) + MONTO),
    `${transfer(antes.esperado)} → ${transfer(conDomicilio)}`,
  );
  const b1 = await bolsillos();
  ok('el efectivo del negocio baja', cerca(b1.cash.balance, antes.bolsillos.cash.balance - MONTO));
  ok('la cuenta del negocio sube', cerca(b1.bank.balance, antes.bolsillos.bank.balance + MONTO));
  ok('el total del negocio NO cambia', cerca(b1.total, antes.bolsillos.total));

  console.log('\n== Lo que NO debe moverse');
  const v1 = await ventas();
  ok('los ingresos del día quedan igual', cerca(v1.revenue ?? 0, antes.ventas.revenue ?? 0));
  ok('las ventas del día quedan igual', (v1.count ?? 0) === (antes.ventas.count ?? 0));
  const p1 = await pyg();
  ok('los ingresos del mes quedan igual', cerca(p1.revenue ?? 0, antes.pyg.revenue ?? 0));
  ok('el costo de lo vendido queda igual', cerca(p1.cogs ?? 0, antes.pyg.cogs ?? 0));
  ok('el resultado del mes queda igual', cerca(p1.net ?? 0, antes.pyg.net ?? 0));

  console.log('\n== El par no se puede partir');
  // El cuerpo va COMPLETO y válido a propósito: si no, responde la validación
  // de forma y nunca se llega al guard del par, que es lo que se quiere probar.
  const editar = await cajero(`/shifts/${S}/cash-movements/${salida.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ type: 'OUT', amount: 1, method: 'CASH', reason: 'intento de edicion' }),
  });
  ok('editar una pata suelta se rechaza', editar.status === 400, `HTTP ${editar.status}`);
  ok(
    'y lo explica en palabras',
    typeof editar.body?.message === 'string' && /domicilio/i.test(editar.body.message),
    String(editar.body?.message ?? '').slice(0, 70),
  );
  const borrarPata = await cajero(`/shifts/${S}/cash-movements/${entrada.id}`, { method: 'DELETE' });
  ok('borrar una pata suelta se rechaza', borrarPata.status === 400, `HTTP ${borrarPata.status}`);

  console.log('\n== Dos domicilios a la vez');
  const [x, y] = await Promise.all([
    cajero(`/shifts/${S}/delivery-payout`, { method: 'POST', body: JSON.stringify({ amount: OTRO_MONTO }) }),
    cajero(`/shifts/${S}/delivery-payout`, { method: 'POST', body: JSON.stringify({ amount: OTRO_MONTO }) }),
  ]);
  ok('los dos entran', x.status === 201 && y.status === 201);
  ok('y son distintos', x.body?.[0]?.pairId !== y.body?.[0]?.pairId);
  const conTres = await esperado();
  ok(
    'el esperado baja por los tres',
    cerca(conTres.expectedCash, antes.esperado.expectedCash - MONTO - 2 * OTRO_MONTO),
    `${conTres.expectedCash}`,
  );

  console.log('\n== Deshacer');
  const dobles = await Promise.all([
    cajero(`/shifts/${S}/delivery-payout/${pairId}`, { method: 'DELETE' }),
    cajero(`/shifts/${S}/delivery-payout/${pairId}`, { method: 'DELETE' }),
  ]);
  const codigos = dobles.map((d) => d.status).sort();
  ok('borrar el mismo dos veces a la vez: uno solo lo borra', codigos[0] === 200 && codigos[1] === 404, codigos.join('/'));
  for (const par of [x.body?.[0]?.pairId, y.body?.[0]?.pairId]) {
    const r = await cajero(`/shifts/${S}/delivery-payout/${par}`, { method: 'DELETE' });
    ok('se deshace el domicilio', r.status === 200, `HTTP ${r.status}`);
  }

  const despues = { esperado: await esperado(), bolsillos: await bolsillos() };
  ok(
    'el cajón vuelve al valor exacto',
    cerca(despues.esperado.expectedCash, antes.esperado.expectedCash),
    `${despues.esperado.expectedCash}`,
  );
  ok('la cuenta vuelve al valor exacto', cerca(transfer(despues.esperado), transfer(antes.esperado)));
  ok('el efectivo del negocio vuelve', cerca(despues.bolsillos.cash.balance, antes.bolsillos.cash.balance));
  ok('la cuenta del negocio vuelve', cerca(despues.bolsillos.bank.balance, antes.bolsillos.bank.balance));
  const sueltos = (await cajero(`/shifts/${S}/cash-movements`)).body ?? [];
  ok('no queda ningún movimiento de domicilio', !sueltos.some((m) => m.purpose === 'DELIVERY_PAYOUT'));

  console.log('\n== Bitácora');
  const bit = (await dueno('/audit?action=DELIVERY_PAYOUT_REGISTERED,DELIVERY_PAYOUT_DELETED&limit=10')).body;
  const filas = Array.isArray(bit) ? bit : (bit?.rows ?? bit?.items ?? []);
  ok('las operaciones quedaron registradas', filas.length > 0, `${filas.length} eventos`);
  ok(
    'y cada una dice el par y el traspaso',
    filas.slice(0, 4).every((f) => f.metadata?.pairId && 'treasuryMovementId' in (f.metadata ?? {})),
  );

  console.log('\n== Anomalías');
  const anom = (await dueno('/reports/anomalies')).body;
  ok('el reporte responde una lista', Array.isArray(anom), typeof anom);
  for (const c of anom ?? []) {
    const turnos = c.shifts ?? [];
    ok(
      `${c.cashierName}: cada turno trae cajón, cuenta y total`,
      turnos.every(
        (t) =>
          'difference' in t &&
          'digitalDifference' in t &&
          'totalDifference' in t &&
          (t.totalDifference === null ||
            t.digitalDifference === null ||
            cerca(t.totalDifference, (t.difference ?? 0) + t.digitalDifference, 0.011)),
      ),
      `${turnos.length} turnos`,
    );
    if (c.baseline) {
      const b = c.baseline;
      ok(
        `${c.cashierName}: el umbral nunca baja del umbral del negocio`,
        b.thresholdDiff === null || b.thresholdDiff >= 5000,
        `umbral ${b.thresholdDiff}`,
      );
      ok(
        `${c.cashierName}: no marca nada por debajo del umbral`,
        turnos.every(
          (t) =>
            !t.flags.includes('diff_high') ||
            (t.totalDifference !== null && Math.abs(t.totalDifference) > (b.thresholdDiff ?? Infinity)),
        ),
      );
      ok(
        `${c.cashierName}: un turno sin arquear no se marca por descuadre`,
        turnos.every((t) => t.totalDifference !== null || !t.flags.includes('diff_high')),
      );
      ok(
        `${c.cashierName}: los campos viejos siguen viajando (despliegue escalonado)`,
        typeof b.avgDiff === 'number' && typeof b.stdDiff === 'number',
      );
    } else {
      ok(`${c.cashierName}: sin baseline, ningún turno queda marcado`, turnos.every((t) => t.flags.length === 0));
    }
  }

  console.log(`\n${fallos === 0 ? 'TODO VERDE' : `${fallos} FALLOS`} — ${hechos} comprobaciones`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nLa batería se cortó:', e.message);
  console.error('Revisa a mano si quedó algún domicilio registrado en la caja abierta.');
  process.exit(1);
});
