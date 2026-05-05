import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';
import { BaseAgent } from './base-agent.interface';

@Injectable()
export class PartnerCompetitorAgent implements BaseAgent {
  agentType = AgentType.PARTNER_COMPETITOR;

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    await this.fakeDelay(600);

    const profile = input.previousOutputs[AgentType.COMPANY_PROFILE_DB];
    const overview = input.previousOutputs[AgentType.COMPANY_RESEARCH_OVERVIEW];

    const partners = profile?.partners ?? [];
    const competitors = profile?.competitors ?? [];

    const rawOutput = {
      agent: this.agentType,
      companyName: profile?.companyName ?? overview?.companyName,
      partners,
      competitors,
      target: input.researchInput.focus_on,
      partnershipInsight:
        partners.length > 0
          ? 'Company has visible partner ecosystem.'
          : 'No strong partner signal found.',
      competitorInsight:
        competitors.length > 0
          ? 'Competitor context is available for positioning.'
          : 'Competitor data is limited.',
    };

    return {
      rawOutput,
      normalizedOutput: {
        partners,
        competitors,
        target: rawOutput.target,
        insight: {
          partnership: rawOutput.partnershipInsight,
          competitor: rawOutput.competitorInsight,
        },
      },
      metadata: {
        model: 'mock-partner-competitor-agent',
        latencyMs: Date.now() - started,
      },
    };
  }

  private fakeDelay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
