import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';
import { BaseAgent } from './base-agent.interface';

@Injectable()
export class CompanyResearchOverviewAgent implements BaseAgent {
  agentType = AgentType.COMPANY_RESEARCH_OVERVIEW;

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    await this.fakeDelay(800);

    const name = input.researchInput.name;
    const url = input.researchInput.url;
    const jobtitle = input.researchInput.jobtitle;
    const focusOn = input.researchInput.focus_on;
    const level = input.researchInput.level ?? 'simple';

    const rawOutput = {
      agent: this.agentType,
      companyName: name,
      website: url,
      jobtitle,
      focusOn,
      level,
      summary: `${name} research overview generated in ${level} mode.`,
      keySignals: [
        'Company overview signal',
        'Market positioning signal',
        'Potential sales research signal',
      ],
    };

    return {
      rawOutput,
      normalizedOutput: {
        companyName: name,
        website: url,
        jobtitle,
        focusOn,
        level,
        summary: rawOutput.summary,
        keySignals: rawOutput.keySignals,
      },
      metadata: {
        model: 'mock-overview-agent',
        latencyMs: Date.now() - started,
      },
    };
  }

  private fakeDelay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
