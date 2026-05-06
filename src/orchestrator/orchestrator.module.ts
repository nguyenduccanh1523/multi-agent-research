import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentRegistryService } from '../agents/agent-registry.service';
import { CompanyProfileDbAgent } from '../agents/company-profile-db.agent';
import { CompanyResearchOverviewAgent } from '../agents/company-research-overview.agent';
import { ContactEnrichmentAgent } from '../agents/contact-enrichment.agent';
import { ContactFinderService } from '../agents/contact-finder.service';
import { PartnerCompetitorAgent } from '../agents/partner-competitor.agent';
import { ScoringAgent } from '../agents/scoring.agent';
import { ThreeWhysMeddpicAgent } from '../agents/three-whys-meddpic.agent';

import { CompanyEntity } from '../database/entities/company.entity';
import { CompanyFileEntity } from '../database/entities/company-file.entity';
import { CompanyProductEntity } from '../database/entities/company-product.entity';
import { CompanyRelatedEntity } from '../database/entities/company-related.entity';
import { ComparisonEntity } from '../database/entities/comparison.entity';
import { CrawlDataEntity } from '../database/entities/crawl-data.entity';
import { OrganizationalEntity } from '../database/entities/organizational.entity';
import { ResearchAgentOutputEntity } from '../database/entities/research-agent-output.entity';
import { ResearchAgentTaskEntity } from '../database/entities/research-agent-task.entity';
import { ResearchCompanyEntity } from '../database/entities/research-company.entity';
import { ResearchPipelineRunEntity } from '../database/entities/research-pipeline-run.entity';
import { ResearchScoreEntity } from '../database/entities/research-score.entity';

import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';
import { RedisCacheModule } from '../redis/redis-cache.module';

import { AggregatorService } from './aggregator.service';
import { DbResearchStore } from './db-research.store';
import { DependencyResolverService } from './dependency-resolver.service';
import { OrchestratorService } from './orchestrator.service';
import { PipelineBuilderService } from './pipeline-builder.service';
import { PipelineQueueService } from './pipeline-queue.service';
import { PipelineRunnerService } from './pipeline-runner.service';
import { ResearchDataRepository } from './research-data.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyEntity,
      CompanyFileEntity,
      CompanyRelatedEntity,
      CompanyProductEntity,

      ResearchCompanyEntity,
      CrawlDataEntity,
      ComparisonEntity,
      ResearchScoreEntity,
      OrganizationalEntity,

      ResearchPipelineRunEntity,
      ResearchAgentTaskEntity,
      ResearchAgentOutputEntity,
    ]),
    LlmModule,
    RagModule,
    RedisCacheModule,
  ],
  providers: [
    ResearchDataRepository,
    DbResearchStore,

    ContactFinderService,

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
