import { Module } from '@nestjs/common';

import { LlmService } from './llm.service';
import { PromptService } from './prompt.service';

@Module({
  providers: [LlmService, PromptService],
  exports: [LlmService, PromptService],
})
export class LlmModule {}
