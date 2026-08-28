import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  GUIA_ASSISTANT_SYSTEM,
  buildGuiaAssistantUserPrompt,
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
    try {
      const result = await this.llm.complete({
        systemPrompt: GUIA_ASSISTANT_SYSTEM,
        userPrompt: buildGuiaAssistantUserPrompt(question, audience),
        maxTokens: MAX_TOKENS,
      });
      const answer = result.text.trim();
      // Una respuesta vacía es un fallo, no una respuesta. Devolverla dejaba al
      // usuario mirando un recuadro en blanco sin saber si falló o si es que no
      // hay nada que decir.
      if (answer.length === 0) {
        throw new Error('el proveedor devolvió una respuesta vacía');
      }
      return { answer, model: result.modelUsed };
    } catch (err) {
      // Sin llave configurada o proveedor caído: se dice, no se finge. La guía
      // escrita sigue ahí y es la respuesta honesta.
      this.logger.error(`asistente de guía falló: ${String(err)}`);
      throw new ServiceUnavailableException(
        'El asistente no está disponible en este momento. La guía escrita tiene la respuesta: búscala por el buscador de arriba.',
      );
    }
  }
}
