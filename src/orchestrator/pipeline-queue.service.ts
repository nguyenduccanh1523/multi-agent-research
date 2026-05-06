import { Injectable, Logger } from '@nestjs/common';

import { PipelineStatus } from '../common/enums/pipeline-status.enum';
import { DbResearchStore } from './db-research.store';
import { PipelineRunnerService } from './pipeline-runner.service';

@Injectable()
export class PipelineQueueService {
  private readonly logger = new Logger(PipelineQueueService.name);

  private readonly queue: string[] = [];
  private activeCount = 0;

  private readonly concurrency = Number(process.env.PIPELINE_CONCURRENCY ?? 3);

  constructor(
    private readonly store: DbResearchStore,
    private readonly pipelineRunner: PipelineRunnerService,
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

      this.logger.log(`Completed pipeline job: ${pipelineRunId}`);
    } catch (error) {
      this.logger.error(`Pipeline job failed: ${pipelineRunId}`, error as any);

      await this.store.updatePipelineRun(pipelineRunId, {
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
}
