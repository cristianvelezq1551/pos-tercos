import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  GUIA_ASSISTANT_SYSTEM,
  buildGuiaAssistantUserPrompt,
  palabrasVoseo,
  type Audience,
} from '@pos-tercos/domain';
import { LLMService } from '../adapters/llm/llm.service';

/** Techo de salida: la respuesta es para leer de pie, no un ensayo. */
const MAX_TOKENS = 320;

@Injectable()
export class GuiaService {
  private readonly logger = new Logger(GuiaService.name);

  constructor(private readonly llm: LLMService) {}

  /**
   * Responde una pregunta sobre cómo usar el sistema, con base ÚNICA en el
   * contenido de la guía. No ve datos del negocio: no puede decir cuánto se
   * vendió, solo dónde se consulta.
   */
  async ask(question: string, audience?: Audience): Promise<{ answer: string; model: string }> {
    const userPrompt = buildGuiaAssistantUserPrompt(question, audience);
    try {
      const primera = await this.completar(GUIA_ASSISTANT_SYSTEM, userPrompt);

      // El prompt prohíbe el voseo, pero el modelo se va igual de vez en cuando
      // ("abre la semana que QUERÉS pagar"). Con el detector en la mano, no hay
      // razón para publicarlo: se reintenta UNA vez señalando las palabras
      // exactas, que es la corrección que un modelo sí acata.
      const voseo = palabrasVoseo(primera.answer);
      if (voseo.length === 0) return primera;

      this.logger.warn(`respuesta con voseo (${voseo.join(', ')}); reintentando`);
      const segunda = await this.completar(
        `${GUIA_ASSISTANT_SYSTEM}\n\nTu respuesta anterior usó voseo: ${voseo.join(', ')}. ` +
          `Reescríbela COMPLETA en tuteo colombiano, sin cambiar el contenido.`,
        userPrompt,
      );
      // Si el segundo intento sigue mal, se devuelve igual: una respuesta útil
      // con una conjugación rara sirve más que no responder.
      return segunda;
    } catch (err) {
      // Sin llave configurada o proveedor caído: se dice, no se finge. La guía
      // escrita sigue ahí y es la respuesta honesta.
      this.logger.error(`asistente de guía falló: ${String(err)}`);
      throw new ServiceUnavailableException(
        'El asistente no está disponible en este momento. La guía escrita tiene la respuesta: búscala por el buscador de arriba.',
      );
    }
  }

  private async completar(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{ answer: string; model: string }> {
    const result = await this.llm.complete({ systemPrompt, userPrompt, maxTokens: MAX_TOKENS });
    const answer = result.text.trim();
    // Una respuesta vacía es un fallo, no una respuesta: devolverla dejaba al
    // usuario mirando un recuadro en blanco sin saber si falló o si no hay nada
    // que decir.
    if (answer.length === 0) {
      throw new Error('el proveedor devolvió una respuesta vacía');
    }
    return { answer, model: result.modelUsed };
  }
}
