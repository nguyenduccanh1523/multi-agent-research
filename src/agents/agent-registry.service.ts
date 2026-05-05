import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { BaseAgent } from './base-agent.interface';
import { CompanyProfileDbAgent } from './company-profile-db.agent';
import { CompanyResearchOverviewAgent } from './company-research-overview.agent';
import { ContactEnrichmentAgent } from './contact-enrichment.agent';
import { PartnerCompetitorAgent } from './partner-competitor.agent';
import { ScoringAgent } from './scoring.agent';
import { ThreeWhysMeddpicAgent } from './three-whys-meddpic.agent';

@Injectable()
export class AgentRegistryService {
  constructor(
    private readonly companyProfileDbAgent: CompanyProfileDbAgent,
    private readonly companyResearchOverviewAgent: CompanyResearchOverviewAgent,
    private readonly threeWhysMeddpicAgent: ThreeWhysMeddpicAgent,
    private readonly partnerCompetitorAgent: PartnerCompetitorAgent,
    private readonly scoringAgent: ScoringAgent,
    private readonly contactEnrichmentAgent: ContactEnrichmentAgent,
  ) {}

  getAgent(agentType: AgentType): BaseAgent {
    const agents: Record<AgentType, BaseAgent> = {
      [AgentType.COMPANY_PROFILE_DB]: this.companyProfileDbAgent,
      [AgentType.COMPANY_RESEARCH_OVERVIEW]: this.companyResearchOverviewAgent,
      [AgentType.THREE_WHYS_MEDDPIC]: this.threeWhysMeddpicAgent,
      [AgentType.PARTNER_COMPETITOR]: this.partnerCompetitorAgent,
      [AgentType.SCORING]: this.scoringAgent,
      [AgentType.CONTACT_ENRICHMENT]: this.contactEnrichmentAgent,
    };

    const agent = agents[agentType];

    if (!agent) {
      throw new Error(`Agent not found: ${agentType}`);
    }

    return agent;
  }
}
