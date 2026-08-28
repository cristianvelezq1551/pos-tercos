import { CHAPTERS } from './index';
import { FLOWS } from './flows';
import type { Audience, GuideBlock } from './types';

export const GUIA_ASSISTANT_SYSTEM = `Eres el asistente de la guía de uso de un POS de restaurante en Colombia.

Respondes SOLO con lo que dice la guía que te paso. Es tu única fuente.

Reglas:
- Español neutro con TUTEO ("vuelve a intentar", nunca "volvé").
- Máximo 6 frases. Quien pregunta está de pie, con las manos ocupadas.
- Empieza por la RUTA de la pantalla si la respuesta es un procedimiento:
  "Cocina → Inventario → botón Merma". Después el resto.
- Si la guía no cubre la pregunta, dilo en una frase y sugiere el tema más
  cercano. NUNCA inventes rutas, botones, campos ni reglas de negocio: una ruta
  inventada hace perder más tiempo que un "no sé".
- Nada de emoji, viñetas de markdown ni encabezados. Texto corrido.
- Si la pregunta menciona un insumo concreto (repollo, pollo), usa ESE nombre en
  la respuesta en vez de hablar en abstracto.
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
  'como','cual','cuales','donde','cuando','porque','por','que','para','del','los','las','una','uno',
  'con','sin','the','and','mi','me','se','si','ya','lo','le','de','en','el','la','un','al','es','no',
  'hago','hace','hacer','registro','registrar','puedo','debo','tengo','esta','este','esa','ese','hay',
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
 * Cuánto se parece un bloque a la pregunta.
 *
 * Pesa DÓNDE cae cada término, no solo si aparece: sin esto, "cómo cierro la
 * caja" traía el flujo de vender —que menciona "caja" de pasada en un paso— por
 * encima del que trata justamente de cerrarla.
 *
 * El match es por prefijo de 4 letras para que "arriendo" encuentre "arriendos"
 * y "merma" encuentre "mermaste", sin arrastrar un stemmer entero.
 */
function relevancia(titulo: string, resumen: string, cuerpo: string, terminos: string[]): number {
  const enTitulo = new Set(palabras(titulo));
  const enResumen = new Set(palabras(resumen));
  const delCuerpo = palabras(cuerpo);

  let score = 0;
  for (const t of terminos) {
    const raiz = t.slice(0, 4);
    const casa = (set: Set<string>) => [...set].some((w) => w.startsWith(raiz));
    if (casa(enTitulo)) score += 12;
    else if (casa(enResumen)) score += 5;
    else {
      // Frecuencia en el cuerpo, con techo: repetir mil veces una palabra no
      // debe ganarle a que esté en el título.
      const veces = delCuerpo.filter((w) => w.startsWith(raiz)).length;
      score += Math.min(veces, 3);
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

/** Cuántos bloques completos se mandan. Más allá, el modelo pierde foco. */
const MAX_FLUJOS = 3;
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
export function buildGuiaKnowledgeBase(question: string, audience?: Audience): string {
  const terminos = palabras(question);
  const partes: string[] = [];

  const flujos = FLOWS.filter((f) => !audience || f.audience.includes(audience));
  const secciones = CHAPTERS.flatMap((c) =>
    c.sections
      .filter((s) => !audience || s.audience.includes(audience))
      .map((s) => ({ capitulo: c.title, seccion: s })),
  );

  // Índice completo: barato y evita que el modelo diga "no está en la guía"
  // cuando en realidad el recorte dejó fuera el bloque correcto.
  partes.push(
    'ÍNDICE DE FLUJOS: ' + flujos.map((f) => `${f.title} (${f.summary})`).join(' | '),
  );
  partes.push('ÍNDICE DE TEMAS: ' + secciones.map((x) => x.seccion.title).join(' | '));

  const flujosOrdenados = flujos
    .map((f) => ({
      f,
      score: relevancia(f.title, `${f.summary} ${f.when}`, textoFlujo(f), terminos),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score > 0)
    .slice(0, MAX_FLUJOS);

  for (const { f } of flujosOrdenados) partes.push(textoFlujo(f));

  const seccionesOrdenadas = secciones
    .map((x) => ({
      ...x,
      score: relevancia(
        x.seccion.title,
        `${x.seccion.summary} ${x.seccion.where ?? ''}`,
        x.seccion.blocks.map(blockText).join(' '),
        terminos,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score > 0)
    .slice(0, MAX_SECCIONES);

  for (const { capitulo, seccion } of seccionesOrdenadas) {
    partes.push(
      `## TEMA: ${seccion.title} (capítulo ${capitulo}${seccion.where ? `, en: ${seccion.where}` : ''})\n` +
        `${seccion.summary} ${seccion.blocks.map(blockText).join(' ')}`,
    );
  }

  return partes.join('\n\n');
}

export function buildGuiaAssistantUserPrompt(question: string, audience?: Audience): string {
  return `GUÍA:\n${buildGuiaKnowledgeBase(question, audience)}\n\nPREGUNTA DE LA PERSONA:\n${question.trim()}`;
}
