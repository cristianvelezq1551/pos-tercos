import { CHAPTERS } from './index';
import { FLOWS } from './flows';
import type { Audience, GuideBlock, GuideFlow, GuideSection } from './types';

export const GUIA_ASSISTANT_SYSTEM = `Eres el asistente de la guía de uso de un POS de restaurante en Colombia.

Respondes SOLO con lo que dice la guía que te paso. Es tu única fuente.

CÓMO ESCRIBES
- Español de Colombia, con TUTEO. Nunca voseo argentino. Esto aplica SIEMPRE,
  también cuando saludas o cuando no entiendes la pregunta.
  Correcto: escribe, marca, elige, toca, guarda, entra, revisa, paga, tienes.
  PROHIBIDO: escribís, marcás, elegís, tocás, guardás, entrás, revisás, tenés,
  querés, podés, sabés, hacés.
- Texto corrido. Sin asteriscos, sin negrita, sin viñetas, sin encabezados, sin
  emoji. Lo que escribas se muestra tal cual, así que un asterisco se ve como un
  asterisco.
- Máximo 6 frases. Quien pregunta está de pie y con las manos ocupadas.

QUÉ RESPONDES
- Si la pregunta es un procedimiento, empieza por la RUTA:
  "Cocina → Inventario → botón Merma". Después el resto.
- El contexto trae FLUJOS completos con sus pasos y sus rutas. Si uno responde
  la pregunta, úsalo aunque no sea el primero de la lista: están ordenados por
  parecido, no por acierto.
- Si de verdad no está, dilo en una frase y nombra el tema más cercano. NUNCA
  inventes rutas, botones, campos ni reglas: una ruta inventada hace perder más
  tiempo que un "no sé".
- Si la pregunta menciona un insumo concreto (repollo, pollo), usa ESE nombre.
- No des cifras de dinero, stock ni ventas: no ves los datos del negocio, solo
  la guía. Si te preguntan cuánto vendieron, di dónde se consulta.`;

function blockText(b: GuideBlock): string {
  switch (b.kind) {
    case 'prose':
    case 'note':
      return b.text;
    case 'warn':
      return `OJO: ${b.text}`;
    case 'rule':
      return `REGLA (${b.title}): ${b.text}`;
    case 'bullets':
      return b.items.join(' | ');
    case 'steps':
      return b.steps.map((s, i) => `${i + 1}. ${s.do}${s.why ? ` (${s.why})` : ''}`).join(' ');
    case 'table':
      return [b.head.join(' / '), ...b.rows.map((r) => r.join(' / '))].join(' ; ');
  }
}

/** Palabras sin valor para medir relevancia. */
const VACIAS = new Set([
  'como','cual','cuales','donde','cuando','porque','por','para','del','los','las','una','uno',
  'con','sin','the','and','que','se','si','ya','lo','le','de','en','el','la','un','al','es','no',
  'puedo','debo','tengo','esta','este','esa','ese','hay','mi','me','su','yo','nos','les',
]);

function palabras(t: string): string[] {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !VACIAS.has(w));
}

/**
 * Raíz aproximada, para que "pago" encuentre "pagar" y "arriendos" encuentre
 * "arriendo". Recorta plurales y terminaciones verbales comunes; no pretende
 * ser un stemmer correcto, solo consistente en los dos lados de la comparación.
 */
function raiz(w: string): string {
  // Solo se recorta si lo que QUEDA sigue siendo una raíz reconocible. Sin ese
  // mínimo, "arriendo" perdía "iendo" y quedaba en "arr", mientras "arriendos"
  // perdía solo la "s" y quedaba en "arriend": la misma palabra dejaba de
  // encontrarse a sí misma en singular y plural.
  const MIN = 4;
  const recorta = (t: string, re: RegExp): string => {
    const corto = t.replace(re, '');
    return corto.length >= MIN ? corto : t;
  };
  let r = w;
  r = recorta(r, /(aciones|amiento|ando|iendo|mos|ron)$/);
  r = recorta(r, /(ar|er|ir|as|os|es|an|en|ado|ada)$/);
  r = recorta(r, /(s|o|a|e)$/);
  return r;
}

/**
 * Peso de cada término por lo RARO que sea (idf).
 *
 * Sin esto, "cargo" y "pago" —que aparecen en media guía— pesaban igual que
 * "arriendo" o "nómina", que aparecen en uno solo. Resultado: "dónde cargo el
 * arriendo" traía "Cargar un insumo" por el título, y "cómo le pago a los
 * empleados" traía el flujo de pedidos web. Un término que está en muchos
 * bloques no distingue nada, y ahora vale casi cero.
 */
function pesosPorRareza(docs: string[][], terminos: string[]): Map<string, number> {
  const total = Math.max(docs.length, 1);
  const pesos = new Map<string, number>();
  for (const t of terminos) {
    const r = raiz(t);
    const enCuantos = docs.filter((d) => d.includes(r)).length;
    // log(N / (1+n)): único → alto; en todos → ~0.
    pesos.set(t, Math.max(Math.log(total / (1 + enCuantos)), 0.05));
  }
  return pesos;
}

function raices(texto: string): string[] {
  return palabras(texto).map(raiz);
}

/**
 * Cuánto se parece un bloque a la pregunta.
 *
 * Pesa DÓNDE cae cada término (título > resumen > cuerpo) multiplicado por lo
 * distintivo que sea. Sin la parte de "dónde", "cómo cierro la caja" traía el
 * flujo de vender, que menciona "caja" de pasada; sin la de "rareza", cualquier
 * verbo común en un título ganaba.
 */
function relevancia(
  titulo: string,
  resumen: string,
  cuerpo: string,
  terminos: string[],
  pesos: Map<string, number>,
): number {
  const enTitulo = new Set(raices(titulo));
  const enResumen = new Set(raices(resumen));
  const delCuerpo = raices(cuerpo);

  let score = 0;
  for (const t of terminos) {
    const r = raiz(t);
    const peso = pesos.get(t) ?? 1;
    if (enTitulo.has(r)) score += 12 * peso;
    else if (enResumen.has(r)) score += 5 * peso;
    else {
      const veces = delCuerpo.filter((w) => w === r).length;
      score += Math.min(veces, 3) * peso;
    }
  }
  return score;
}

function textoFlujo(f: (typeof FLOWS)[number]): string {
  return [
    `## FLUJO: ${f.title}`,
    `Para qué: ${f.summary}`,
    `Cuándo: ${f.when}`,
    f.before.length ? `Antes: ${f.before.join(' | ')}` : '',
    `Pasos: ${f.steps.map((s, i) => `${i + 1}. ${s.do}${s.why ? ` (${s.why})` : ''}`).join(' ')}`,
    `Dónde se ve: ${f.sightings
      .map((s) => `${s.where} → ${s.what}${s.means ? ` [${s.means}]` : ''}`)
      .join(' ; ')}`,
    f.pitfalls.length ? `Cuidado: ${f.pitfalls.map(blockText).join(' ')}` : '',
    f.questions.length ? `Preguntas: ${f.questions.map((q) => `P: ${q.q} R: ${q.a}`).join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Cuántos bloques completos se mandan. Más allá, el modelo pierde foco.
 * Con 30 flujos, 3 dejaba fuera el correcto en preguntas donde el título
 * engaña; 5 sigue siendo barato (~1,5k caracteres cada uno).
 */
const MAX_FLUJOS = 5;
const MAX_SECCIONES = 6;

/**
 * La guía serializada para el modelo, RECORTADA a lo que se parece a la
 * pregunta.
 *
 * Mandarla entera son ~23.000 tokens por pregunta: caro y, peor, ruidoso — el
 * modelo tiene que elegir entre ochenta temas y a veces contesta con el
 * equivocado. Se manda el índice completo (títulos, baratos) más el TEXTO
 * completo de lo que más se parece a la pregunta.
 *
 * Se arma del MISMO contenido que lee la pantalla: si mañana cambia un paso, el
 * asistente responde distinto sin que nadie toque el prompt.
 */
interface Candidatos {
  flujos: GuideFlow[];
  secciones: { capitulo: string; seccion: GuideSection }[];
}

/** Los bloques que esta audiencia puede ver. */
function candidatos(audience?: Audience): Candidatos {
  return {
    flujos: FLOWS.filter((f) => !audience || f.audience.includes(audience)),
    secciones: CHAPTERS.flatMap((c) =>
      c.sections
        .filter((s) => !audience || s.audience.includes(audience))
        .map((s) => ({ capitulo: c.title, seccion: s })),
    ),
  };
}

function textoSeccion(x: { capitulo: string; seccion: GuideSection }): string {
  const { capitulo, seccion } = x;
  return (
    `## TEMA: ${seccion.title} (capítulo ${capitulo}` +
    `${seccion.where ? `, en: ${seccion.where}` : ''})\n` +
    `${seccion.summary} ${seccion.blocks.map(blockText).join(' ')}`
  );
}

/** Los N más parecidos a la pregunta, descartando los que no comparten nada. */
function masParecidos<T>(
  items: T[],
  score: (item: T) => number,
  tope: number,
): T[] {
  return items
    .map((item) => ({ item, s: score(item) }))
    .sort((a, b) => b.s - a.s)
    .filter((x) => x.s > 0)
    .slice(0, tope)
    .map((x) => x.item);
}

/**
 * La guía serializada para el modelo, RECORTADA a lo que se parece a la
 * pregunta.
 *
 * Mandarla entera son ~23.000 tokens por pregunta: caro y, peor, ruidoso — el
 * modelo tiene que elegir entre treinta flujos y a veces contesta con el
 * equivocado. Se manda el índice completo (títulos, baratos) más el TEXTO
 * completo de lo que más se parece a la pregunta.
 *
 * Se arma del MISMO contenido que lee la pantalla: si mañana cambia un paso, el
 * asistente responde distinto sin que nadie toque el prompt.
 */
export function buildGuiaKnowledgeBase(question: string, audience?: Audience): string {
  const terminos = palabras(question);
  const { flujos, secciones } = candidatos(audience);

  // Los pesos se calculan sobre TODOS los bloques candidatos: así "pago", que
  // está en media guía, vale poco, y "arriendo", que está en uno, vale mucho.
  const pesos = pesosPorRareza(
    [...flujos.map((f) => raices(textoFlujo(f))), ...secciones.map((x) => raices(textoSeccion(x)))],
    terminos,
  );

  // El índice completo es barato y evita que el modelo diga "no está en la
  // guía" cuando el recorte dejó fuera el bloque correcto.
  const partes = [
    'ÍNDICE DE FLUJOS: ' + flujos.map((f) => `${f.title} (${f.summary})`).join(' | '),
    'ÍNDICE DE TEMAS: ' + secciones.map((x) => x.seccion.title).join(' | '),
  ];

  for (const f of masParecidos(
    flujos,
    (f) =>
      relevancia(
        f.title,
        `${f.summary} ${f.when} ${f.before.join(' ')} ${f.questions.map((q) => q.q).join(' ')}`,
        textoFlujo(f),
        terminos,
        pesos,
      ),
    MAX_FLUJOS,
  )) {
    partes.push(textoFlujo(f));
  }

  for (const x of masParecidos(
    secciones,
    (x) =>
      relevancia(
        x.seccion.title,
        `${x.seccion.summary} ${x.seccion.where ?? ''}`,
        x.seccion.blocks.map(blockText).join(' '),
        terminos,
        pesos,
      ),
    MAX_SECCIONES,
  )) {
    partes.push(textoSeccion(x));
  }

  return partes.join('\n\n');
}

export function buildGuiaAssistantUserPrompt(question: string, audience?: Audience): string {
  return `GUÍA:\n${buildGuiaKnowledgeBase(question, audience)}\n\nPREGUNTA DE LA PERSONA:\n${question.trim()}`;
}
