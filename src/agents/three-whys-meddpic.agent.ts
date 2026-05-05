import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';
import { BaseAgent } from './base-agent.interface';

@Injectable()
export class ThreeWhysMeddpicAgent implements BaseAgent {
  agentType = AgentType.THREE_WHYS_MEDDPIC;

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    await this.fakeDelay(700);

    const profile = input.previousOutputs[AgentType.COMPANY_PROFILE_DB];
    const overview = input.previousOutputs[AgentType.COMPANY_RESEARCH_OVERVIEW];

    const companyName =
      profile?.companyName ??
      overview?.companyName ??
      input.researchInput.name ??
      'Unknown Company';

    const rawOutput = {
      agent: this.agentType,
      companyName,
      basedOn: {
        hasCompanyProfile: Boolean(profile),
        hasOverview: Boolean(overview),
      },
      threeWhys: [
        `Why now: ${companyName} may need better research and sales qualification.`,
        `Why this solution: Multi-agent research can combine profile, overview, MEDDPIC and scoring.`,
        `Why us: The system can generate structured research output from multiple agents.`,
      ],
      meddpic: {
        metrics: [
          'Time saved in research',
          'Higher lead qualification accuracy',
        ],
        economicBuyer: input.researchInput.jobtitle ?? 'Unknown',
        decisionCriteria: ['Business pain', 'Fit score', 'Contactability'],
        decisionProcess: 'Needs validation',
        paperProcess: 'Unknown',
        identifyPain: [
          'Manual company research takes time',
          'Sales context is fragmented',
          'Qualification criteria are not centralized',
        ],
        champion: 'Unknown',
      },
    };

    return {
      rawOutput,
      normalizedOutput: {
        needs: rawOutput.threeWhys,
        painPoints: rawOutput.meddpic.identifyPain,
        meddpic: rawOutput.meddpic,
      },
      metadata: {
        model: 'mock-three-whys-agent',
        latencyMs: Date.now() - started,
      },
    };
  }

  private fakeDelay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
