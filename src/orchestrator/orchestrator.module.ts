import { Module } from '@nestjs/common';

import { AgentRegistryService } from '../agents/agent-registry.service';
import { CompanyProfileDbAgent } from '../agents/company-profile-db.agent';
import { CompanyResearchOverviewAgent } from '../agents/company-research-overview.agent';
import { ContactEnrichmentAgent } from '../agents/contact-enrichment.agent';
import { PartnerCompetitorAgent } from '../agents/partner-competitor.agent';
import { ScoringAgent } from '../agents/scoring.agent';
import { ThreeWhysMeddpicAgent } from '../agents/three-whys-meddpic.agent';
import { CompanyProfileMemoryCacheService } from '../memory/company-profile-memory-cache.service';
import { AggregatorService } from './aggregator.service';
import { DependencyResolverService } from './dependency-resolver.service';
import { InMemoryResearchStore } from './in-memory-research.store';
import { OrchestratorService } from './orchestrator.service';
import { PipelineBuilderService } from './pipeline-builder.service';
import { PipelineQueueService } from './pipeline-queue.service';
import { PipelineRunnerService } from './pipeline-runner.service';

@Module({
  providers: [
    InMemoryResearchStore,
    CompanyProfileMemoryCacheService,

    CompanyProfileDbAgent,
    CompanyResearchOverviewAgent,
    ThreeWhysMeddpicAgent,
    PartnerCompetitorAgent,
    ScoringAgent,
    ContactEnrichmentAgent,
    AgentRegistryService,

    DependencyResolverService,
    AggregatorService,
    PipelineBuilderService,
    PipelineRunnerService,
    PipelineQueueService,
    OrchestratorService,
  ],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
