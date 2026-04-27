import { Global, Module } from '@nestjs/common';
import { AnthropicLLMAdapter } from './anthropic.adapter';
import { LLMService } from './llm.service';
import { OpenAILLMAdapter } from './openai.adapter';

@Global()
@Module({
  providers: [AnthropicLLMAdapter, OpenAILLMAdapter, LLMService],
  exports: [LLMService],
})
export class LLMModule {}
