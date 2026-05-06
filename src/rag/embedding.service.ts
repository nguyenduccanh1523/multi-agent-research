import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { DataSource } from 'typeorm';

export interface InsertEmbeddingParams {
  sourceType: string;
  sourceTable: string;
  sourceId: number;
  sourceField: string;
  chunkIndex?: number;
  companyId?: number | null;
  researchCompanyId?: number | null;
  content: string;
}

export interface InsertEmbeddingResult {
  embedding_id: string | number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  private readonly client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  private readonly model =
    process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';

  constructor(private readonly dataSource: DataSource) {}

  async embedText(text: string): Promise<number[]> {
    const cleanText = (text ?? '').trim();

    if (!cleanText) {
      return [];
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: cleanText,
    });

    return response.data[0]?.embedding ?? [];
  }

  async insertEmbedding(
    params: InsertEmbeddingParams,
  ): Promise<InsertEmbeddingResult | null> {
    const content = (params.content ?? '').trim();

    if (!content) {
      return null;
    }

    const contentHash = this.hashContent({
      sourceType: params.sourceType,
      sourceTable: params.sourceTable,
      sourceId: params.sourceId,
      sourceField: params.sourceField,
      chunkIndex: params.chunkIndex ?? 0,
      content,
    });

    const existed: InsertEmbeddingResult[] = await this.dataSource.query(
      `
      SELECT embedding_id
      FROM public.tb_embeddings
      WHERE content_hash = $1
      LIMIT 1
      `,
      [contentHash],
    );

    if (existed.length > 0) {
      return existed[0];
    }

    const embedding = await this.embedText(content);

    if (!embedding.length) {
      return null;
    }

    const vectorLiteral = `[${embedding.join(',')}]`;

    const rows: InsertEmbeddingResult[] = await this.dataSource.query(
      `
      INSERT INTO public.tb_embeddings (
        source_type,
        source_table,
        source_id,
        source_field,
        chunk_index,
        company_id,
        research_company_id,
        content,
        embedding,
        model,
        dim,
        metric,
        content_hash,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9::vector,
        $10, $11, $12, $13, now()
      )
      RETURNING embedding_id
      `,
      [
        params.sourceType,
        params.sourceTable,
        params.sourceId,
        params.sourceField,
        params.chunkIndex ?? 0,
        params.companyId ?? null,
        params.researchCompanyId ?? null,
        content,
        vectorLiteral,
        this.model,
        embedding.length,
        'cosine',
        contentHash,
      ],
    );

    return rows[0] ?? null;
  }

  async insertCrawlDataEmbeddings(params: {
    researchCompanyId: number;
    crawlDataId: number;
    crawl: {
      corporateInitiatives?: string | null;
      triggerEvents?: string | null;
      techStack?: string | null;
      financialCapacity?: string | null;
      businessData?: any;
    };
  }): Promise<InsertEmbeddingResult[]> {
    const fields: Array<{
      field: string;
      content: string;
    }> = [
      {
        field: 'corporate_initiatives',
        content: params.crawl.corporateInitiatives ?? '',
      },
      {
        field: 'trigger_events',
        content: params.crawl.triggerEvents ?? '',
      },
      {
        field: 'tech_stack',
        content: params.crawl.techStack ?? '',
      },
      {
        field: 'financial_capacity',
        content: params.crawl.financialCapacity ?? '',
      },
      {
        field: 'business_data',
        content: JSON.stringify(params.crawl.businessData ?? {}),
      },
    ];

    const result: InsertEmbeddingResult[] = [];

    for (const item of fields) {
      const saved = await this.insertEmbedding({
        sourceType: 'crawl_data',
        sourceTable: 'tb_crawl_data',
        sourceId: params.crawlDataId,
        sourceField: item.field,
        chunkIndex: 0,
        companyId: null,
        researchCompanyId: params.researchCompanyId,
        content: item.content,
      });

      if (saved) {
        result.push(saved);
      }
    }

    this.logger.log(
      `Inserted crawl embeddings: researchCompanyId=${params.researchCompanyId}, crawlDataId=${params.crawlDataId}, count=${result.length}`,
    );

    return result;
  }

  private hashContent(input: {
    sourceType: string;
    sourceTable: string;
    sourceId: number;
    sourceField: string;
    chunkIndex: number;
    content: string;
  }) {
    return createHash('sha256')
      .update(
        [
          input.sourceType,
          input.sourceTable,
          input.sourceId,
          input.sourceField,
          input.chunkIndex,
          input.content,
        ].join('|'),
      )
      .digest('hex');
  }
}
