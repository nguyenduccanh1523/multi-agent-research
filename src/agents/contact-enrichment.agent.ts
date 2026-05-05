import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';
import { BaseAgent } from './base-agent.interface';

@Injectable()
export class ContactEnrichmentAgent implements BaseAgent {
  agentType = AgentType.CONTACT_ENRICHMENT;

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    await this.fakeDelay(500);

    const overview = input.previousOutputs[AgentType.COMPANY_RESEARCH_OVERVIEW];

    const companyName = overview?.companyName ?? input.researchInput.name;
    const website = overview?.website ?? input.researchInput.url;

    const rawOutput = {
      agent: this.agentType,
      companyName,
      website,
      basedOn: {
        hasOverview: Boolean(overview),
      },
      contacts: [
        {
          name: 'Mock Contact',
          title: input.researchInput.jobtitle ?? 'Head of Sales',
          linkedinUrl: website ? `${website}/linkedin/mock-contact` : null,
          email: website ? `sales@${this.extractDomain(website)}` : null,
        },
      ],
    };

    return {
      rawOutput,
      normalizedOutput: {
        contacts: rawOutput.contacts,
        source: 'mock-contact-enrichment',
      },
      metadata: {
        model: 'mock-contact-agent',
        latencyMs: Date.now() - started,
      },
    };
  }

  private extractDomain(website: string): string {
    return website
      .replace('https://', '')
      .replace('http://', '')
      .replace('www.', '')
      .split('/')[0];
  }

  private fakeDelay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
