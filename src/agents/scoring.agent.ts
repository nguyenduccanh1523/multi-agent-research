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
export class ScoringAgent implements BaseAgent {
  agentType = AgentType.SCORING;

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

    const model =
      process.env.SCORING_MODEL ??
      process.env.COMPARISON_MODEL_DETAIL ??
      process.env.OPENAI_MODEL_DETAIL ??
      'gpt-5';

    const prompt = this.prompts.scoringPrompt();

    const result = await this.llm.json({
      provider: 'openai',
      model,
      system: prompt.system,
      responseFormat: this.prompts.scoringResponseFormat(),
      user: JSON.stringify({
        primary_company: {
          company_name: profile.companyName,
          website: profile.website,
          products: profile.productInfor ?? profile.products,
          documents_ai: profile.documentsAi,
          partners: profile.partners,
          competitors: profile.competitors,
          profile_context: profile.profileEmbeddingContext,
        },
        research_company: {
          company_name: overview.companyName,
          website: overview.website,
          role: overview.role,
          focus_on: overview.focusOn,
          corporate_initiatives: overview.corporateInitiatives,
          tech_stack: overview.techStack,
          trigger_events: overview.triggerEvents,
          financial_capacity: overview.financialCapacity,
          business_data: overview.businessData,
          research_context: overview.researchEmbeddingContext,
        },
      }),
    });

    const fit = result.fit_breakdown ?? {};

    const score = await this.researchDataRepo.upsertResearchScore({
      researchCompanyId,
      needFit: fit.need_fit?.score ?? null,
      needFitSummary: fit.need_fit?.summary ?? null,
      solutionFit: fit.solution_fit?.score ?? null,
      solutionFitSummary: fit.solution_fit?.summary ?? null,
      initiativeFit: fit.initiative_fit?.score ?? null,
      initiativeFitSummary: fit.initiative_fit?.summary ?? null,
      executionFit: fit.execution_fit?.score ?? null,
      executionFitSummary: fit.execution_fit?.summary ?? null,
      riskFit: fit.risk_fit?.score ?? null,
      riskFitSummary: fit.risk_fit?.summary ?? null,
      overallScore: result.collaboration_fit_score ?? null,
      summary: result.summary ?? null,
    });

    return {
      rawOutput: {
        agent: this.agentType,
        result,
        score,
      },
      normalizedOutput: {
        collaborationFitScore: result.collaboration_fit_score ?? null,
        relationshipType: result.relationship_type ?? null,
        summary: result.summary ?? null,
        positiveFactors: result.positive_factors ?? [],
        negativeFactors: result.negative_factors ?? [],
        finalAssessment: result.final_assessment ?? null,
        fitBreakdown: result.fit_breakdown ?? {},
        savedScore: {
          researchScoreId: score.researchScoreId,
          overallScore: score.overallScore,
          summary: score.summary,
        },
      },
      metadata: {
        model,
        latencyMs: Date.now() - started,
      },
    };
  }
}
