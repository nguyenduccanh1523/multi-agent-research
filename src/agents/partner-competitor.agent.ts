import { Injectable, Logger } from '@nestjs/common';

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
  private readonly logger = new Logger(PartnerCompetitorAgent.name);

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

    const prompt = this.prompts.partnerCompetitorPrompt(level);

    const primaryCompany = {
      company_name: profile.companyName,
      company_infor: profile.profileEmbeddingContext ?? '',
      products: profile.productInfor ?? profile.products ?? '',
      documents_ai: profile.documentsAi ?? '',
      partners:
        profile.partners && profile.partners.length
          ? profile.partners
          : 'None provided',
      competitors:
        profile.competitors && profile.competitors.length
          ? profile.competitors
          : 'None provided',
    };

    const targetCompany = {
      company_name: overview.companyName,
      focus_on: overview.focusOn,
      corporate_initiatives: overview.corporateInitiatives,
      tech_stack: overview.techStack,
      trigger_events: overview.triggerEvents,
      financial_capacity: overview.financialCapacity,
      business_data: overview.businessData,
      research_context: overview.researchEmbeddingContext,
    };

    const userPrompt = this.prompts.partnerCompetitorUserPrompt({
      primaryCompany,
      targetCompany,
    });

    const llmStartedAt = Date.now();

    this.logger.log(
      `[PartnerCompetitorStart] pipelineRunId=${input.pipelineRunId} researchCompanyId=${researchCompanyId} model=${model} level=${level} promptChars=${userPrompt.length} partnersCount=${
        Array.isArray(profile.partners) ? profile.partners.length : 0
      } competitorsCount=${Array.isArray(profile.competitors) ? profile.competitors.length : 0}`,
    );

    const result = await this.llm.json({
      label: 'PartnerCompetitor.main',
      provider: 'openai',
      model,
      level,
      system: prompt.system,
      responseFormat: {
        type: 'json_object',
      },
      user: userPrompt,
      temperature:
        level === 'simple' && model.includes('gpt-4o') ? 0.2 : undefined,
    });

    this.logger.log(
      `[PartnerCompetitorDone] pipelineRunId=${input.pipelineRunId} researchCompanyId=${researchCompanyId} took=${
        Date.now() - llmStartedAt
      }ms resultKeys=${Object.keys(result ?? {}).join(',')}`,
    );

    const detailedPartnerAnalysis = this.ensurePartnerDisplayTextArray(
      this.asArray(result['3_partner_impact_analysis']),
    );

    const detailedEnemiesAnalysis = this.ensureCompetitorDisplayTextArray(
      this.asArray(result['4_competitor_comparison_analysis']),
    );

    /**
     * FORMAT CHUẨN CHO DETAIL:
     * compare_partner: { detailed_analysis: [...] }
     * compare_enemies: { detailed_analysis: [...] }
     */
    const comparePartner = {
      detailed_analysis: detailedPartnerAnalysis,
    };

    const compareEnemies = {
      detailed_analysis: detailedEnemiesAnalysis,
    };

    const compareOverall = {
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
      comparePartner,
      compareEnemies,
      compareOverall,
    });

    return {
      rawOutput: {
        agent: this.agentType,
        model,
        level,
        result,
        comparePartner,
        compareEnemies,
        compareOverall,
        comparison,
      },
      normalizedOutput: {
        comparePartner,
        compareEnemies,
        compareOverall,
      },
      metadata: {
        model,
        latencyMs: Date.now() - started,
      },
    };
  }

  private ensurePartnerDisplayTextArray(items: any[]): any[] {
    const normalized = items.map((item) => {
      if (typeof item === 'string') {
        return {
          partner_name: 'Partner',
          display_text: item,
          role_relationship_type: 'Unknown',
          impact_type: 'Neutral',
          impact_mechanism: item,
          magnitude_score: '1',
          likelihood_impact_matters_to_target: 'Low',
          business_implications: '',
          risks_introduced: '',
          recommended_action: 'deprioritize',
          evidence_assumption: 'Converted from string response.',
          primary_company_context: '',
        };
      }

      if (!item || typeof item !== 'object') {
        return {
          partner_name: 'Partner',
          display_text: 'No partner analysis available.',
          role_relationship_type: 'Unknown',
          impact_type: 'Neutral',
          impact_mechanism: 'No partner analysis available.',
          magnitude_score: '1',
          likelihood_impact_matters_to_target: 'Low',
          business_implications: '',
          risks_introduced: '',
          recommended_action: 'deprioritize',
          evidence_assumption: 'No valid partner data returned by model.',
          primary_company_context: '',
        };
      }

      const partnerName =
        item.partner_name ?? item.company_name ?? item.name ?? 'Partner';

      const impactType =
        item.impact_type ?? item.net_effect ?? item.effect ?? 'Neutral';

      const mechanism =
        item.impact_mechanism ??
        item.why ??
        item.business_implications ??
        item.primary_company_context ??
        item.evidence_assumption ??
        '';

      const displayText =
        typeof item.display_text === 'string' && item.display_text.trim()
          ? item.display_text.trim()
          : this.cleanText(`${partnerName}: ${impactType} - ${mechanism}`);

      return {
        partner_name: partnerName,
        display_text: displayText,
        role_relationship_type: item.role_relationship_type ?? 'Unknown',
        impact_type: impactType,
        impact_mechanism: mechanism,
        magnitude_score: item.magnitude_score ?? '1',
        likelihood_impact_matters_to_target:
          item.likelihood_impact_matters_to_target ?? 'Low',
        business_implications: item.business_implications ?? '',
        risks_introduced: item.risks_introduced ?? '',
        recommended_action: item.recommended_action ?? 'deprioritize',
        evidence_assumption: item.evidence_assumption ?? '',
        primary_company_context: item.primary_company_context ?? '',
      };
    });

    return normalized.length
      ? normalized
      : [
          {
            partner_name: 'Partner',
            display_text: 'No partner data available.',
            role_relationship_type: 'Unknown',
            impact_type: 'Neutral',
            impact_mechanism: 'No partner data available.',
            magnitude_score: '1',
            likelihood_impact_matters_to_target: 'Low',
            business_implications: '',
            risks_introduced: '',
            recommended_action: 'deprioritize',
            evidence_assumption: 'No partner data provided.',
            primary_company_context: '',
          },
        ];
  }

  private ensureCompetitorDisplayTextArray(items: any[]): any[] {
    const normalized = items.map((item) => {
      if (typeof item === 'string') {
        return {
          competitor_name: 'Competitor',
          display_text: item,
          primary_advantage_vs_competitor: '',
          primary_weakness_vs_competitor: '',
          how_competitor_appeals_to_target: item,
          impact_on_win_probability: 'neutral',
          competitive_play: '',
          evidence_assumption: 'Converted from string response.',
          primary_company_context: '',
        };
      }

      if (!item || typeof item !== 'object') {
        return {
          competitor_name: 'Competitor',
          display_text: 'No competitor analysis available.',
          primary_advantage_vs_competitor: '',
          primary_weakness_vs_competitor: '',
          how_competitor_appeals_to_target: 'No competitor analysis available.',
          impact_on_win_probability: 'neutral',
          competitive_play: '',
          evidence_assumption: 'No valid competitor data returned by model.',
          primary_company_context: '',
        };
      }

      const competitorName =
        item.competitor_name ?? item.company_name ?? item.name ?? 'Competitor';

      const impact =
        item.impact_on_win_probability ??
        item.net_effect ??
        item.effect ??
        'neutral';

      const reason =
        item.how_competitor_appeals_to_target ??
        item.why ??
        item.primary_advantage_vs_competitor ??
        item.primary_weakness_vs_competitor ??
        item.competitive_play ??
        '';

      const displayText =
        typeof item.display_text === 'string' && item.display_text.trim()
          ? item.display_text.trim()
          : this.cleanText(`${competitorName}: ${impact} - ${reason}`);

      return {
        competitor_name: competitorName,
        display_text: displayText,
        primary_advantage_vs_competitor:
          item.primary_advantage_vs_competitor ?? '',
        primary_weakness_vs_competitor:
          item.primary_weakness_vs_competitor ?? '',
        how_competitor_appeals_to_target:
          item.how_competitor_appeals_to_target ?? reason,
        impact_on_win_probability: impact,
        competitive_play: item.competitive_play ?? '',
        evidence_assumption: item.evidence_assumption ?? '',
        primary_company_context: item.primary_company_context ?? '',
      };
    });

    return normalized.length
      ? normalized
      : [
          {
            competitor_name: 'Competitor',
            display_text: 'No competitor data available.',
            primary_advantage_vs_competitor: '',
            primary_weakness_vs_competitor: '',
            how_competitor_appeals_to_target: 'No competitor data available.',
            impact_on_win_probability: 'neutral',
            competitive_play: '',
            evidence_assumption: 'No competitor data provided.',
            primary_company_context: '',
          },
        ];
  }

  private asArray(value: any): any[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    return [value];
  }

  private cleanText(value: string): string {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
