import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { LlmService } from '../llm/llm.service';
import { PromptService } from '../llm/prompt.service';
import { DbResearchStore } from '../orchestrator/db-research.store';
import { ResearchDataRepository } from '../orchestrator/research-data.repository';
import { EmbeddingService } from '../rag/embedding.service';
import { RagRetrievalService } from '../rag/rag-retrieval.service';
import { BaseAgent } from './base-agent.interface';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';

@Injectable()
export class CompanyResearchOverviewAgent implements BaseAgent {
  agentType = AgentType.COMPANY_RESEARCH_OVERVIEW;

  constructor(
    private readonly researchDataRepo: ResearchDataRepository,
    private readonly store: DbResearchStore,
    private readonly embeddingService: EmbeddingService,
    private readonly rag: RagRetrievalService,
    private readonly llm: LlmService,
    private readonly prompts: PromptService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    const research = await this.researchDataRepo.createResearchCompany({
      userId: Number(input.researchInput.user_id),
      name: input.researchInput.name,
      url: input.researchInput.url,
      jobtitle: input.researchInput.jobtitle,
      focusOn: input.researchInput.focus_on,
      uploadDocs: input.researchInput.upload_docs ?? [],
      uploadDocsAi: input.researchInput.upload_docs_ai ?? [],
    });

    await this.store.updatePipelineRun(input.pipelineRunId, {
      researchCompanyId: research.researchCompanyId,
    });

    const prompt = this.prompts.researchOverviewPrompt();

    const llmResult = await this.llm.json({
      provider: 'perplexity',
      model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
      level: input.researchInput.level,
      system: prompt.system,
      user: JSON.stringify({
        company_name: input.researchInput.name,
        website: input.researchInput.url,
        focus_on: input.researchInput.focus_on,
        jobtitle: input.researchInput.jobtitle,
        instruction:
          'Research this company using current public web knowledge and return the required JSON schema.',
      }),
    });

    const crawl = await this.researchDataRepo.createCrawlData({
      researchCompanyId: research.researchCompanyId,
      corporateInitiatives: llmResult.corporate_initiatives ?? '',
      triggerEvents: llmResult.trigger_events ?? '',
      techStack: llmResult.tech_stack ?? '',
      financialCapacity: llmResult.financial_capacity ?? '',
      domain: llmResult.domain ?? [],
      businessData: llmResult.business_data ?? {},
    });

    await this.embeddingService.insertCrawlDataEmbeddings({
      researchCompanyId: research.researchCompanyId,
      crawlDataId: crawl.crawDataId,
      crawl: {
        corporateInitiatives: crawl.corporateInitiatives,
        triggerEvents: crawl.triggerEvents,
        techStack: crawl.techStack,
        financialCapacity: crawl.financialCapacity,
        businessData: crawl.businessData,
      },
    });

    const researchEmbeddingContext = await this.rag.getResearchContext({
      researchCompanyId: research.researchCompanyId,
      query: [
        input.researchInput.name,
        input.researchInput.focus_on,
        crawl.corporateInitiatives,
        crawl.triggerEvents,
        crawl.techStack,
        crawl.financialCapacity,
      ]
        .filter(Boolean)
        .join('\n'),
      limit: 8,
      maxChars: 5000,
    });

    return {
      rawOutput: {
        agent: this.agentType,
        research,
        crawl,
        llmResult,
        researchEmbeddingContext,
      },
      normalizedOutput: {
        researchCompanyId: research.researchCompanyId,
        crawlDataId: crawl.crawDataId,

        companyName: research.companyName,
        website: research.website,
        role: research.role,
        focusOn: research.focusOn,

        officialWebsite: llmResult.official_website ?? research.website,

        corporateInitiatives: crawl.corporateInitiatives,
        triggerEvents: crawl.triggerEvents,
        techStack: crawl.techStack,
        financialCapacity: crawl.financialCapacity,
        businessData: crawl.businessData,

        domain: this.safeJson(crawl.domain, []),

        createdAt: crawl.createdAt,
        researchCreatedAt: research.createdAt,

        researchEmbeddingContext,
      },
      metadata: {
        model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
        latencyMs: Date.now() - started,
      },
    };
  }

  private safeJson<T>(raw: any, fallback: T): T {
    if (!raw) return fallback;
    if (Array.isArray(raw) || typeof raw === 'object') return raw;

    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
}
