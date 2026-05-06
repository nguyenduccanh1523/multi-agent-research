import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { EmbeddingService } from './embedding.service';

@Injectable()
export class RagRetrievalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async searchByCompanyId(params: {
    companyId: number;
    query: string;
    limit?: number;
  }) {
    const queryEmbedding = await this.embeddingService.embedText(params.query);

    if (!queryEmbedding.length) {
      return [];
    }

    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    return this.dataSource.query(
      `
      SELECT
        embedding_id,
        source_type,
        source_table,
        source_id,
        source_field,
        chunk_index,
        company_id,
        research_company_id,
        content,
        model,
        dim,
        metric,
        created_at,
        1 - (embedding <=> $1::vector) AS similarity
      FROM public.tb_embeddings
      WHERE company_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
      [vectorLiteral, params.companyId, params.limit ?? 8],
    );
  }

  async searchByResearchCompanyId(params: {
    researchCompanyId: number;
    query: string;
    limit?: number;
  }) {
    const queryEmbedding = await this.embeddingService.embedText(params.query);

    if (!queryEmbedding.length) {
      return [];
    }

    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    return this.dataSource.query(
      `
      SELECT
        embedding_id,
        source_type,
        source_table,
        source_id,
        source_field,
        chunk_index,
        company_id,
        research_company_id,
        content,
        model,
        dim,
        metric,
        created_at,
        1 - (embedding <=> $1::vector) AS similarity
      FROM public.tb_embeddings
      WHERE research_company_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
      [vectorLiteral, params.researchCompanyId, params.limit ?? 8],
    );
  }

  async getCompanyProfileContext(params: {
    companyId: number;
    query: string;
    limit?: number;
    maxChars?: number;
  }) {
    const rows = await this.searchByCompanyId({
      companyId: params.companyId,
      query: params.query,
      limit: params.limit ?? 8,
    });

    return this.rowsToContext(rows, params.maxChars ?? 5000);
  }

  async getResearchContext(params: {
    researchCompanyId: number;
    query: string;
    limit?: number;
    maxChars?: number;
  }) {
    const rows = await this.searchByResearchCompanyId({
      researchCompanyId: params.researchCompanyId,
      query: params.query,
      limit: params.limit ?? 8,
    });

    return this.rowsToContext(rows, params.maxChars ?? 5000);
  }

  private rowsToContext(rows: any[], maxChars: number) {
    return rows
      .map((row) => {
        return [
          `[${row.source_type}.${row.source_field}]`,
          `similarity=${Number(row.similarity ?? 0).toFixed(4)}`,
          row.content,
        ].join('\n');
      })
      .join('\n\n---\n\n')
      .slice(0, maxChars);
  }
}
