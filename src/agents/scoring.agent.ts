import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';
import { BaseAgent } from './base-agent.interface';

@Injectable()
export class ScoringAgent implements BaseAgent {
  agentType = AgentType.SCORING;

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    await this.fakeDelay(400);

    const profile = input.previousOutputs[AgentType.COMPANY_PROFILE_DB];
    const overview = input.previousOutputs[AgentType.COMPANY_RESEARCH_OVERVIEW];

    let score = 40;

    if (profile) score += 20;
    if (overview) score += 20;
    if (profile?.industry) score += 5;
    if (profile?.partners?.length) score += 5;
    if (profile?.competitors?.length) score += 5;
    if (overview?.keySignals?.length) score += 5;

    score = Math.min(score, 100);

    const rawOutput = {
      agent: this.agentType,
      companyName:
        profile?.companyName ??
        overview?.companyName ??
        input.researchInput.name ??
        null,
      website:
        profile?.website ??
        overview?.website ??
        input.researchInput.url ??
        null,
      score,
      level: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
      confidence: profile && overview ? 0.8 : 0.6,
      explanation: [
        profile
          ? 'Company Profile DB output is available.'
          : 'Company Profile DB output is missing.',
        overview
          ? 'Company Research Overview output is available.'
          : 'Company Research Overview output is missing.',
        'Scoring is calculated only from Company Profile DB and Company Research Overview outputs.',
      ],
      scoringBasis: {
        hasCompanyProfile: Boolean(profile),
        hasOverview: Boolean(overview),
        hasIndustry: Boolean(profile?.industry),
        partnerCount: profile?.partners?.length ?? 0,
        competitorCount: profile?.competitors?.length ?? 0,
        overviewSignalCount: overview?.keySignals?.length ?? 0,
      },
    };

    return {
      rawOutput,
      normalizedOutput: {
        companyName: rawOutput.companyName,
        website: rawOutput.website,
        score: rawOutput.score,
        level: rawOutput.level,
        confidence: rawOutput.confidence,
        explanation: rawOutput.explanation,
        scoringBasis: rawOutput.scoringBasis,
      },
      metadata: {
        model: 'mock-scoring-agent',
        latencyMs: Date.now() - started,
      },
    };
  }

  private fakeDelay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
