import { Module } from '@nestjs/common';

import { EmbeddingService } from './embedding.service';
import { RagRetrievalService } from './rag-retrieval.service';

@Module({
  providers: [EmbeddingService, RagRetrievalService],
  exports: [EmbeddingService, RagRetrievalService],
})
export class RagModule {}
