import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { ResearchDataRepository } from '../orchestrator/research-data.repository';
import { BaseAgent } from './base-agent.interface';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';
import { ContactFinderService } from './contact-finder.service';

@Injectable()
export class ContactEnrichmentAgent implements BaseAgent {
  agentType = AgentType.CONTACT_ENRICHMENT;

  constructor(
    private readonly researchDataRepo: ResearchDataRepository,
    private readonly contactFinder: ContactFinderService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    const overview = input.previousOutputs[AgentType.COMPANY_RESEARCH_OVERVIEW];

    const researchCompanyId = Number(overview.researchCompanyId);

    const linkedinContacts = await this.contactFinder.findLinkedinMinCost({
      companyName: overview.companyName ?? input.researchInput.name,
      companyUrl: overview.website ?? input.researchInput.url,
      numResults: 30,
    });

    const contacts = linkedinContacts.map((item) => ({
      name: this.extractNameFromTitle(item.title),
      role: item.title ?? input.researchInput.jobtitle ?? null,
      linkedin: item.linkedin_url,
      email: null,
    }));

    const savedContacts = await this.researchDataRepo.saveContacts({
      researchCompanyId,
      contacts,
    });

    return {
      rawOutput: {
        agent: this.agentType,
        linkedinContacts,
        contacts: savedContacts,
      },
      normalizedOutput: {
        contacts: savedContacts.map((item) => ({
          name: item.name,
          role: item.role,
          linkedin: item.linkedin,
          email: item.email,
        })),
      },
      metadata: {
        model: 'serpapi-linkedin-min-cost',
        latencyMs: Date.now() - started,
      },
    };
  }

  private extractNameFromTitle(title?: string | null): string | null {
    if (!title) return null;

    const cleaned = title.split('|')[0].split('-')[0].trim();

    return cleaned || null;
  }
}
