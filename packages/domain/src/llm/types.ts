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

// ====================================================================
// Purchase suggestion evaluation (FASE 12.D)
// ====================================================================

export interface PurchaseSuggestionEvalRequest {
  /** Prompt de usuario armado por el caller (con datos del item + historial). */
  userPrompt: string;
}

export interface PurchaseSuggestionEvalResult {
  /** Texto en español del análisis (≤3 frases). */
  rationale: string;
  /** Identifier del modelo usado (anthropic:claude-haiku-4-5, etc). */
  modelUsed: string;
}

export interface LLMProvider {
  readonly name: string;
  extractInvoice(req: LLMInvoiceExtractionRequest): Promise<LLMInvoiceExtractionResult>;
  evaluatePurchaseSuggestion(
    req: PurchaseSuggestionEvalRequest,
  ): Promise<PurchaseSuggestionEvalResult>;
}
