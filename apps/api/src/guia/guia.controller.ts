import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Audience } from '@pos-tercos/domain';
import type { JwtAccessPayload } from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KitchenOrCashierAccess } from '../auth/decorators/roles.decorator';
import { GuiaService } from './guia.service';

const MIN_LEN = 5;
const MAX_LEN = 300;

/** El cocinero solo ve sus flujos; el resto ve todo. */
function audienceOf(role: string): Audience | undefined {
  return role === 'COCINERO' ? 'cocina' : undefined;
}

@Controller('guia')
export class GuiaController {
  constructor(private readonly guia: GuiaService) {}

  /**
   * Pregunta libre sobre cómo usar el sistema. Cada llamada cuesta plata, así
   * que va limitada por usuario; el tope es holgado para una persona con dudas
   * y estrecho para un bucle accidental.
   */
  @KitchenOrCashierAccess()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  // Es una consulta, no crea nada: 200, no el 201 que Nest pone por defecto.
  @HttpCode(200)
  @Post('preguntar')
  async ask(
    @Body('question') question: unknown,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<{ answer: string; model: string }> {
    if (typeof question !== 'string') {
      throw new BadRequestException('Escribe tu pregunta.');
    }
    const q = question.trim();
    if (q.length < MIN_LEN) {
      throw new BadRequestException('Escribe la pregunta completa para poder responderte.');
    }
    if (q.length > MAX_LEN) {
      throw new BadRequestException(
        `La pregunta es muy larga (máximo ${MAX_LEN} caracteres). Divídela en dos.`,
      );
    }
    return this.guia.ask(q, audienceOf(user.role));
  }
}
