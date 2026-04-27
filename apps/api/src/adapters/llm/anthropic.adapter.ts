import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import {
  INVOICE_EXTRACTION_SYSTEM,
  INVOICE_EXTRACTION_USER,
  type LLMInvoiceExtractionRequest,
  type LLMInvoiceExtractionResult,
  type LLMProvider,
} from '@pos-tercos/domain';
import { ExtractedInvoiceSchema } from '@pos-tercos/types';

@Injectable()
export class AnthropicLLMAdapter implements LLMProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicLLMAdapter.name);
  private client: Anthropic | null = null;
  private readonly model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set');
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async extractInvoice(
    req: LLMInvoiceExtractionRequest,
  ): Promise<LLMInvoiceExtractionResult> {
    const client = this.getClient();
    const base64 = req.imageBuffer.toString('base64');

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: INVOICE_EXTRACTION_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: req.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                data: base64,
              },
            },
            { type: 'text', text: INVOICE_EXTRACTION_USER },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const cleaned = stripCodeFences(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      this.logger.error(
        `Anthropic returned non-JSON: ${text.slice(0, 200)}…`,
        err as Error,
      );
      throw new Error('LLM did not return valid JSON');
    }

    const extraction = ExtractedInvoiceSchema.parse(parsed);
    return {
      extraction,
      modelUsed: `anthropic:${this.model}`,
    };
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    return stripped;
  }
  return trimmed;
}
