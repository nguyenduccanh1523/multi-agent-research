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

    const level = input.researchInput.level === 'simple' ? 'simple' : 'detail';

    const model =
      level === 'simple'
        ? (process.env.COMPARISON_MODEL_SIMPLE ??
          process.env.OPENAI_MODEL_SIMPLE ??
          'gpt-4o')
        : (process.env.COMPARISON_MODEL_DETAIL ??
          process.env.OPENAI_MODEL_DETAIL ??
          'gpt-5');

    const prompt = this.prompts.threeWhysMeddpicPrompt(level);

    const userPrompt = this.prompts.threeWhysMeddpicUserPrompt({
      targetCompany: {
        focus_area: overview.focusOn,
        company_name: overview.companyName,
        website: overview.website,
        corporate_initiatives: overview.corporateInitiatives,
        trigger_events: overview.triggerEvents,
        technology_stack: overview.techStack,
        financial_capacity: overview.financialCapacity,
        business_data: overview.businessData,
      },
      primaryCompany: {
        company_name: profile.companyName,
        website: profile.website,
        profile: profile.profileEmbeddingContext,
        documents_ai: profile.documentsAi,
        product_information: profile.productInfor ?? profile.products,
        competitor_information: profile.competitors,
        partner_information: profile.partners,
      },
      role: overview.role ?? input.researchInput.jobtitle,
      ragContext: {
        profile_context: profile.profileEmbeddingContext,
        research_context: overview.researchEmbeddingContext,
      },
    });

    const result = await this.llm.json({
      provider: 'openai',
      model,
      level,
      system: prompt.system,
      responseFormat: model.includes('gpt-5')
        ? { type: 'json_object' }
        : undefined,
      user: userPrompt,
      temperature:
        level === 'simple' && model.includes('gpt-4o') ? 0.2 : undefined,
    });

    const comparison = await this.researchDataRepo.upsertThreeWhysMeddpic({
      researchCompanyId,
      whyThis: result.why_this ?? '',
      whyUs: result.why_us ?? '',
      whyNow: result.why_now ?? '',
      meddics: result.meddpics ?? {},
      detailLevel: level,
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
        model,
        latencyMs: Date.now() - started,
      },
    };
  }
}
