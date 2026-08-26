import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMInvoiceExtractionRequest,
  LLMInvoiceExtractionResult,
  LLMProvider,
  PurchaseSuggestionEvalRequest,
  PurchaseSuggestionEvalResult,
} from '@pos-tercos/domain';
import { AnthropicLLMAdapter } from './anthropic.adapter';
import { OpenAILLMAdapter } from './openai.adapter';

/**
 * Lo que ve la persona cuando no hay proveedor de IA configurado.
 *
 * Antes decía "No LLM provider configured. Set ANTHROPIC_API_KEY or
 * OPENAI_API_KEY" y ese texto llegaba TAL CUAL al toast del admin: inglés,
 * nombres de variables de entorno y ninguna acción posible para quien lo lee
 * (§3). El detalle técnico va al log, que es donde sirve.
 */
const SIN_PROVEEDOR_IA =
  'El asistente de IA no está configurado en el servidor, así que esta función no está disponible. Avísale al dueño para que active la llave.';

/**
 * Compone una estrategia primary + fallback. La env var `LLM_PROVIDER`
 * controla cuál es el primario:
 *   - 'anthropic' (default): Anthropic primary, OpenAI fallback si falla
 *   - 'openai': OpenAI primary, Anthropic fallback si falla
 *   - 'fallback': prueba Anthropic; si no está configurado, usa OpenAI
 *
 * Si solo hay UNA key configurada, esa se usa sin fallback.
 */
@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);

  constructor(
    private readonly anthropic: AnthropicLLMAdapter,
    private readonly openai: OpenAILLMAdapter,
  ) {}

  async extractInvoice(
    req: LLMInvoiceExtractionRequest,
  ): Promise<LLMInvoiceExtractionResult> {
    const chain = this.buildChain();
    if (chain.length === 0) {
      this.logNoProvider();
      throw new ServiceUnavailableException(SIN_PROVEEDOR_IA);
    }

    let lastError: unknown;
    for (const provider of chain) {
      try {
        const result = await provider.extractInvoice(req);
        return result;
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `${provider.name} extraction failed; trying next provider. Error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('All LLM providers failed');
  }

  async evaluatePurchaseSuggestion(
    req: PurchaseSuggestionEvalRequest,
  ): Promise<PurchaseSuggestionEvalResult> {
    const chain = this.buildChain();
    if (chain.length === 0) {
      this.logNoProvider();
      throw new ServiceUnavailableException(SIN_PROVEEDOR_IA);
    }

    let lastError: unknown;
    for (const provider of chain) {
      try {
        return await provider.evaluatePurchaseSuggestion(req);
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `${provider.name} eval failed; trying next provider. Error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('All LLM providers failed');
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResult> {
    const chain = this.buildChain();
    if (chain.length === 0) {
      this.logNoProvider();
      throw new ServiceUnavailableException(SIN_PROVEEDOR_IA);
    }
    let lastError: unknown;
    for (const provider of chain) {
      try {
        return await provider.complete(req);
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `${provider.name} completion failed; trying next. Error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error('All LLM providers failed');
  }

  /** El "qué hacer" real, para quien mira los logs del servidor. */
  private logNoProvider(): void {
    this.logger.error(
      'Ningún proveedor de IA configurado: falta ANTHROPIC_API_KEY (o OPENAI_API_KEY) en el entorno del servidor.',
    );
  }

  private buildChain(): LLMProvider[] {
    const preference = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
    const anthropicReady = this.anthropic.isConfigured();
    const openaiReady = this.openai.isConfigured();

    if (preference === 'openai' && openaiReady) {
      return [this.openai, ...(anthropicReady ? [this.anthropic] : [])];
    }
    // Default: anthropic primary + openai fallback (only those configured)
    return [
      ...(anthropicReady ? [this.anthropic] : []),
      ...(openaiReady ? [this.openai] : []),
    ];
  }
}
