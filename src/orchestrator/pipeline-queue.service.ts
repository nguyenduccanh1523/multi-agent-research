import { Injectable, Logger } from '@nestjs/common';

import { PipelineStatus } from '../common/enums/pipeline-status.enum';
import { AggregatorService } from './aggregator.service';
import { InMemoryResearchStore } from './in-memory-research.store';
import { PipelineRunnerService } from './pipeline-runner.service';

@Injectable()
export class PipelineQueueService {
  private readonly logger = new Logger(PipelineQueueService.name);

  private readonly queue: string[] = [];
  private activeCount = 0;

  /**
   * Số pipeline chạy song song.
   * Multi Research 10 companies thì sẽ chạy tối đa 3 pipeline cùng lúc.
   */
  private readonly concurrency = 3;

  constructor(
    private readonly store: InMemoryResearchStore,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly aggregator: AggregatorService,
  ) {}

  enqueue(pipelineRunId: string) {
    this.queue.push(pipelineRunId);
    this.processNext();
  }

  private processNext() {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const pipelineRunId = this.queue.shift();

      if (!pipelineRunId) {
        return;
      }

      this.activeCount += 1;

      setImmediate(() => {
        void this.runPipelineJob(pipelineRunId);
      });
    }
  }

  private async runPipelineJob(pipelineRunId: string) {
    try {
      this.logger.log(`Start pipeline job: ${pipelineRunId}`);

      await this.pipelineRunner.runPipeline(pipelineRunId);

      const pipelineRun = this.store.getPipelineRun(pipelineRunId);

      if (pipelineRun.batchId) {
        this.finalizeBatchIfCompleted(pipelineRun.batchId);
      }

      this.logger.log(`Completed pipeline job: ${pipelineRunId}`);
    } catch (error) {
      this.logger.error(`Pipeline job failed: ${pipelineRunId}`, error as any);

      this.store.updatePipelineRun(pipelineRunId, {
        status: PipelineStatus.FAILED,
        completedAt: new Date(),
        errorJson: {
          message: error instanceof Error ? error.message : 'Unknown error',
          raw: String(error),
        },
      });
    } finally {
      this.activeCount -= 1;
      this.processNext();
    }
  }

  private finalizeBatchIfCompleted(batchId: string) {
    const pipelines = this.store.listPipelineRunsByBatch(batchId);

    const terminalStatuses = [
      PipelineStatus.SUCCEEDED,
      PipelineStatus.PARTIAL_SUCCESS,
      PipelineStatus.FAILED,
      PipelineStatus.CANCELLED,
    ];

    const allDone = pipelines.every((pipeline) =>
      terminalStatuses.includes(pipeline.status),
    );

    if (!allDone) {
      return;
    }

    const successCount = pipelines.filter(
      (pipeline) =>
        pipeline.status === PipelineStatus.SUCCEEDED ||
        pipeline.status === PipelineStatus.PARTIAL_SUCCESS,
    ).length;

    const failedCount = pipelines.filter(
      (pipeline) => pipeline.status === PipelineStatus.FAILED,
    ).length;

    const finalBatchResult = this.aggregator.aggregateBatchResult(batchId);

    this.store.updateBatch(batchId, {
      status:
        failedCount > 0
          ? PipelineStatus.PARTIAL_SUCCESS
          : PipelineStatus.SUCCEEDED,
      successCount,
      failedCount,
      completedAt: new Date(),
      finalOutputJson: finalBatchResult,
    });
  }
}
