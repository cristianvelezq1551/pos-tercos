import type { ExtractedInvoice } from '@pos-tercos/types';

export interface LLMInvoiceExtractionRequest {
  imageBuffer: Buffer;
  /** MIME type, ej: 'image/jpeg' | 'image/png' | 'image/webp' */
  mimeType: string;
}

export interface LLMInvoiceExtractionResult {
  extraction: ExtractedInvoice;
  /** Identifier del modelo realmente usado (anthropic:claude-haiku-4-5, openai:gpt-4o-mini, etc). */
  modelUsed: string;
}

export interface LLMProvider {
  readonly name: string;
  extractInvoice(req: LLMInvoiceExtractionRequest): Promise<LLMInvoiceExtractionResult>;
}
