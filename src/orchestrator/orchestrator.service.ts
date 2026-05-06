import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { PipelineStatus } from '../common/enums/pipeline-status.enum';
import { ResearchMode } from '../common/enums/research-mode.enum';
import { ResearchTool } from '../common/enums/research-tool.enum';
import { ResearchPipelineRunEntity } from '../database/entities/research-pipeline-run.entity';
import { DbResearchStore } from './db-research.store';
import { PipelineBuilderService } from './pipeline-builder.service';
import { PipelineQueueService } from './pipeline-queue.service';
import { CompanyProfileRedisCacheService } from 'src/redis/company-profile-redis-cache.service';

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly store: DbResearchStore,
    private readonly pipelineBuilder: PipelineBuilderService,
    private readonly pipelineQueue: PipelineQueueService,
    private readonly companyProfileCache: CompanyProfileRedisCacheService,
  ) {}

  async startSingleResearch(input: Record<string, any>) {
    const selectedTools: ResearchTool[] | undefined = input.selected_tools;

    const pipelineRun = await this.pipelineBuilder.createPipeline({
      mode: ResearchMode.SINGLE,
      userId: Number(input.user_id),
      inputJson: input,
      selectedTools,
    });

    this.pipelineQueue.enqueue(pipelineRun.id);

    return {
      message: 'Single research pipeline queued',
      pipelineRunId: pipelineRun.id,
      status: pipelineRun.status,
      nextStep: `GET /research/pipelines/${pipelineRun.id}`,
      snapshot: await this.store.getPipelineSnapshot(pipelineRun.id),
    };
  }

  async startMultiResearch(input: { companies: Record<string, any>[] }) {
    const batchId = uuidv4();

    const pipelineRuns: ResearchPipelineRunEntity[] = [];

    for (const companyInput of input.companies) {
      const selectedTools: ResearchTool[] | undefined =
        companyInput.selected_tools;

      const pipelineRun = await this.pipelineBuilder.createPipeline({
        mode: ResearchMode.MULTI,
        batchId,
        userId: Number(companyInput.user_id),
        inputJson: companyInput,
        selectedTools,
      });

      pipelineRuns.push(pipelineRun);
    }

    for (const pipelineRun of pipelineRuns) {
      this.pipelineQueue.enqueue(pipelineRun.id);
    }

    return {
      message: 'Multi research batch queued',
      batchId,
      status: PipelineStatus.RUNNING,
      pipelineRunIds: pipelineRuns.map((item) => item.id),
      nextStep: `GET /research/batches/${batchId}`,
    };
  }

  getPipeline(pipelineRunId: string) {
    return this.store.getPipelineSnapshot(pipelineRunId);
  }

  getBatch(batchId: string) {
    return this.store.getBatchSnapshot(batchId);
  }

  invalidateCompanyProfileCache(userId: number) {
    return this.companyProfileCache.invalidateUser(userId);
  }

  getCompanyProfileCacheDebug(userId: number) {
    return this.companyProfileCache.getDebugInfo(userId);
  }

  getPipelineProgress(pipelineRunId: string) {
    return this.store.getPipelineProgress(pipelineRunId);
  }
}
