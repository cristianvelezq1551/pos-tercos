import { Injectable, Logger } from '@nestjs/common';
import {
  INVOICE_EXTRACTION_SYSTEM,
  INVOICE_EXTRACTION_USER,
  type LLMInvoiceExtractionRequest,
  type LLMInvoiceExtractionResult,
  type LLMProvider,
} from '@pos-tercos/domain';
import { ExtractedInvoiceSchema } from '@pos-tercos/types';
import OpenAI from 'openai';

@Injectable()
export class OpenAILLMAdapter implements LLMProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAILLMAdapter.name);
  private client: OpenAI | null = null;
  private readonly model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set');
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async extractInvoice(
    req: LLMInvoiceExtractionRequest,
  ): Promise<LLMInvoiceExtractionResult> {
    const client = this.getClient();
    const base64 = req.imageBuffer.toString('base64');

    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INVOICE_EXTRACTION_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: INVOICE_EXTRACTION_USER },
            {
              type: 'image_url',
              image_url: { url: `data:${req.mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
      this.logger.error(
        `OpenAI returned non-JSON: ${text.slice(0, 200)}…`,
        err as Error,
      );
      throw new Error('LLM did not return valid JSON');
    }

    if (parsed.items === undefined || parsed.items === null) parsed.items = [];
    if (parsed.warnings === undefined || parsed.warnings === null) parsed.warnings = [];

    const extraction = ExtractedInvoiceSchema.parse(parsed);
    return {
      extraction,
      modelUsed: `openai:${this.model}`,
    };
  }
}
