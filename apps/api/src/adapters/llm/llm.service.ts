import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type {
  LLMInvoiceExtractionRequest,
  LLMInvoiceExtractionResult,
  LLMProvider,
} from '@pos-tercos/domain';
import { AnthropicLLMAdapter } from './anthropic.adapter';
import { OpenAILLMAdapter } from './openai.adapter';

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
      throw new ServiceUnavailableException(
        'No LLM provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
      );
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
