import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { LlmService } from '../llm/llm.service';
import { PromptService } from '../llm/prompt.service';
import { ResearchDataRepository } from '../orchestrator/research-data.repository';
import { BaseAgent } from './base-agent.interface';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';

@Injectable()
export class ThreeWhysMeddpicAgent implements BaseAgent {
  agentType = AgentType.THREE_WHYS_MEDDPIC;

  constructor(
    private readonly researchDataRepo: ResearchDataRepository,
    private readonly llm: LlmService,
    private readonly prompts: PromptService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    const profile = input.previousOutputs[AgentType.COMPANY_PROFILE_DB];
    const overview = input.previousOutputs[AgentType.COMPANY_RESEARCH_OVERVIEW];

    const researchCompanyId = Number(overview.researchCompanyId);
    const level = input.researchInput.level ?? 'detail';

    const prompt = this.prompts.threeWhysMeddpicPrompt(level);

    const result = await this.llm.json({
      provider: 'openai',
      level,
      system: prompt.system,
      user: JSON.stringify({
        target_company: {
          focus_area: overview.focusOn,
          company_name: overview.companyName,
          website: overview.website,
          corporate_initiatives: overview.corporateInitiatives,
          trigger_events: overview.triggerEvents,
          technology_stack: overview.techStack,
          financial_capacity: overview.financialCapacity,
          business_data: overview.businessData,
        },
        our_company: {
          company_name: profile.companyName,
          website: profile.website,
          profile: profile.profileEmbeddingContext,
          documents_ai: profile.documentsAi,
          product_information: profile.productInfor ?? profile.products,
          competitor_information: profile.competitors,
          partner_information: profile.partners,
        },
        role: overview.role ?? input.researchInput.jobtitle,
        rag_context: {
          profile_context: profile.profileEmbeddingContext,
          research_context: overview.researchEmbeddingContext,
        },
      }),
    });

    const comparison = await this.researchDataRepo.upsertThreeWhysMeddpic({
      researchCompanyId,
      whyThis: result.why_this ?? '',
      whyUs: result.why_us ?? '',
      whyNow: result.why_now ?? '',
      meddics: result.meddpics ?? {},
      detailLevel: level === 'simple' ? 'simple' : 'detail',
    });

    return {
      rawOutput: {
        agent: this.agentType,
        result,
        comparison,
      },
      normalizedOutput: {
        whyThis: comparison.whyThis,
        whyUs: comparison.whyUs,
        whyNow: comparison.whyNow,
        meddpics: comparison.meddics,
        detailLevel: comparison.detailLevel,
      },
      metadata: {
        model:
          level === 'simple'
            ? process.env.OPENAI_MODEL_SIMPLE
            : process.env.OPENAI_MODEL_DETAIL,
        latencyMs: Date.now() - started,
      },
    };
  }
}
