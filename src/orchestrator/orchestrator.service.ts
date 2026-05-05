import { Injectable } from '@nestjs/common';

import { PipelineStatus } from '../common/enums/pipeline-status.enum';
import { ResearchMode } from '../common/enums/research-mode.enum';
import { ResearchTool } from '../common/enums/research-tool.enum';
import { CompanyProfileMemoryCacheService } from '../memory/company-profile-memory-cache.service';
import { InMemoryResearchStore } from './in-memory-research.store';
import { PipelineBuilderService } from './pipeline-builder.service';
import { PipelineQueueService } from './pipeline-queue.service';

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly store: InMemoryResearchStore,
    private readonly pipelineBuilder: PipelineBuilderService,
    private readonly pipelineQueue: PipelineQueueService,
    private readonly companyCache: CompanyProfileMemoryCacheService,
  ) {}

  startSingleResearch(input: Record<string, any>) {
    const selectedTools: ResearchTool[] | undefined = input.selected_tools;

    const pipelineRun = this.pipelineBuilder.createPipeline({
      mode: ResearchMode.SINGLE,
      inputJson: input,
      selectedTools,
    });

    this.pipelineQueue.enqueue(pipelineRun.id);

    return {
      message: 'Single research pipeline queued',
      pipelineRunId: pipelineRun.id,
      status: pipelineRun.status,
      nextStep: `GET /research/pipelines/${pipelineRun.id}`,
      snapshot: this.store.getPipelineSnapshot(pipelineRun.id),
    };
  }

  startMultiResearch(input: { companies: Record<string, any>[] }) {
    const batch = this.store.createBatch(input.companies.length);

    this.store.updateBatch(batch.id, {
      status: PipelineStatus.RUNNING,
    });

    const pipelineRuns = input.companies.map((companyInput) =>
      this.pipelineBuilder.createPipeline({
        mode: ResearchMode.MULTI,
        batchId: batch.id,
        inputJson: companyInput,
        selectedTools: companyInput.selected_tools,
      }),
    );

    for (const pipelineRun of pipelineRuns) {
      this.pipelineQueue.enqueue(pipelineRun.id);
    }

    return {
      message: 'Multi research batch queued',
      batchId: batch.id,
      status: PipelineStatus.RUNNING,
      pipelineRunIds: pipelineRuns.map((item) => item.id),
      nextStep: `GET /research/batches/${batch.id}`,
      batch: this.store.getBatch(batch.id),
    };
  }

  getPipeline(pipelineRunId: string) {
    return this.store.getPipelineSnapshot(pipelineRunId);
  }

  getBatch(batchId: string) {
    return this.store.getBatchSnapshot(batchId);
  }

  getCompanyCache() {
    return this.companyCache.list();
  }

  clearCompanyCache() {
    this.companyCache.clear();

    return {
      message: 'Company profile RAM cache cleared',
    };
  }
}
