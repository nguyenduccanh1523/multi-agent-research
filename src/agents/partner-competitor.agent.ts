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
export class PartnerCompetitorAgent implements BaseAgent {
  agentType = AgentType.PARTNER_COMPETITOR;

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

    const prompt = this.prompts.partnerCompetitorPrompt();

    const result = await this.llm.json({
      provider: 'openai',
      level: input.researchInput.level,
      system: prompt.system,
      user: JSON.stringify({
        primary_company: {
          company_name: profile.companyName,
          website: profile.website,
          documents_ai: profile.documentsAi,
          product_information: profile.productInfor ?? profile.products,
          partners: profile.partners?.length
            ? profile.partners
            : 'None provided',
          competitors: profile.competitors?.length
            ? profile.competitors
            : 'None provided',
          profile_context: profile.profileEmbeddingContext,
        },
        target_company: {
          company_name: overview.companyName,
          website: overview.website,
          focus_on: overview.focusOn,
          corporate_initiatives: overview.corporateInitiatives,
          tech_stack: overview.techStack,
          trigger_events: overview.triggerEvents,
          financial_capacity: overview.financialCapacity,
          business_data: overview.businessData,
          research_context: overview.researchEmbeddingContext,
        },
        explicit_requirements: [
          'Use PRIMARY COMPANY profile data to analyze partnership ecosystem.',
          'Use competitors field to identify competitive threats.',
          'Use partners field to identify ecosystem enablers.',
          'Analyze how each partner or competitor impacts collaboration with TARGET COMPANY.',
          'Section 3 must list partner impact analysis.',
          'Section 4 must list competitor comparison analysis.',
          'Section 6 must mark each company as partner or competitor.',
        ],
      }),
    });

    const partnerAnalysis = {
      detailed_analysis: result['3_partner_impact_analysis'] ?? [],
    };

    const enemiesAnalysis = {
      detailed_analysis: result['4_competitor_comparison_analysis'] ?? [],
    };

    const overallAnalysis = {
      '1_requirement_restatement': result['1_requirement_restatement'] ?? '',
      '2_executive_summary': result['2_executive_summary'] ?? {},
      '5_cross_cutting_analysis': result['5_cross_cutting_analysis'] ?? {},
      '6_specific_impact_identification':
        result['6_specific_impact_identification'] ?? [],
      '7_win_loss_factors': result['7_win_loss_factors'] ?? [],
      '8_recommended_next_steps': result['8_recommended_next_steps'] ?? [],
    };

    const comparison = await this.researchDataRepo.upsertPartnerCompetitor({
      researchCompanyId,
      comparePartner: partnerAnalysis,
      compareEnemies: enemiesAnalysis,
      compareOverall: overallAnalysis,
    });

    return {
      rawOutput: {
        agent: this.agentType,
        result,
        comparison,
      },
      normalizedOutput: {
        comparePartner: comparison.comparePartner,
        compareEnemies: comparison.compareEnemies,
        compareOverall: comparison.compareOverall,
      },
      metadata: {
        model:
          input.researchInput.level === 'simple'
            ? process.env.OPENAI_MODEL_SIMPLE
            : process.env.OPENAI_MODEL_DETAIL,
        latencyMs: Date.now() - started,
      },
    };
  }
}
