import { Injectable } from '@nestjs/common';

import { AgentRegistryService } from '../agents/agent-registry.service';
import { AgentTaskStatus } from '../common/enums/agent-task-status.enum';
import { PipelineStatus } from '../common/enums/pipeline-status.enum';
import { AggregatorService } from './aggregator.service';
import { DependencyResolverService } from './dependency-resolver.service';
import { InMemoryResearchStore } from './in-memory-research.store';
import { ResearchAgentTaskRecord } from './types/pipeline-records.types';

@Injectable()
export class PipelineRunnerService {
  constructor(
    private readonly store: InMemoryResearchStore,
    private readonly agentRegistry: AgentRegistryService,
    private readonly dependencyResolver: DependencyResolverService,
    private readonly aggregator: AggregatorService,
  ) {}

  async runPipeline(pipelineRunId: string) {
    this.store.updatePipelineRun(pipelineRunId, {
      status: PipelineStatus.RUNNING,
      startedAt: new Date(),
    });

    while (true) {
      const pipelineRun = this.store.getPipelineRun(pipelineRunId);
      const tasks = this.store.listAgentTasks(pipelineRunId);

      if (this.dependencyResolver.hasFatalFailure(tasks)) {
        const failedTasks = tasks.filter(
          (task) => task.required && task.status === AgentTaskStatus.FAILED,
        );

        this.store.updatePipelineRun(pipelineRunId, {
          status: PipelineStatus.FAILED,
          completedAt: new Date(),
          errorJson: {
            message: 'Required agent task failed',
            failedTasks,
          },
        });

        return this.store.getPipelineSnapshot(pipelineRunId);
      }

      if (this.areAllTasksTerminal(tasks)) {
        const finalReport = this.aggregator.aggregateFinalReport(pipelineRun);

        const hasOptionalFailedTask = tasks.some(
          (task) => !task.required && task.status === AgentTaskStatus.FAILED,
        );

        this.store.updatePipelineRun(pipelineRunId, {
          status: hasOptionalFailedTask
            ? PipelineStatus.PARTIAL_SUCCESS
            : PipelineStatus.SUCCEEDED,
          completedAt: new Date(),
          finalOutputJson: finalReport,
        });

        return this.store.getPipelineSnapshot(pipelineRunId);
      }

      const readyTasks = this.dependencyResolver.resolveReadyTasks(tasks);

      if (readyTasks.length === 0) {
        this.store.updatePipelineRun(pipelineRunId, {
          status: PipelineStatus.FAILED,
          completedAt: new Date(),
          errorJson: {
            message:
              'No ready tasks found, but pipeline has not completed. Check dependency graph.',
            tasks,
          },
        });

        return this.store.getPipelineSnapshot(pipelineRunId);
      }

      await Promise.all(
        readyTasks.map((task) => {
          this.store.updateAgentTask(task.id, {
            status: AgentTaskStatus.READY,
          });

          return this.executeAgentTask(task.id);
        }),
      );
    }
  }

  private areAllTasksTerminal(tasks: ResearchAgentTaskRecord[]): boolean {
    const terminalStatuses = [
      AgentTaskStatus.SUCCEEDED,
      AgentTaskStatus.FAILED,
      AgentTaskStatus.SKIPPED,
    ];

    return tasks.every((task) => terminalStatuses.includes(task.status));
  }

  private async executeAgentTask(taskId: string): Promise<void> {
    const task = this.store.getAgentTask(taskId);

    try {
      this.store.updateAgentTask(task.id, {
        status: AgentTaskStatus.RUNNING,
        startedAt: new Date(),
        attemptCount: task.attemptCount + 1,
        errorJson: null,
      });

      const latestTask = this.store.getAgentTask(task.id);
      const pipelineRun = this.store.getPipelineRun(task.pipelineRunId);
      const previousOutputs = this.store.getPreviousOutputs(task.pipelineRunId);

      const agent = this.agentRegistry.getAgent(task.agentType);

      const agentInput = {
        pipelineRunId: pipelineRun.id,
        agentTaskId: task.id,
        agentType: task.agentType,
        researchInput: pipelineRun.inputJson,
        previousOutputs,
      };

      const result = await agent.run(agentInput);

      this.store.createAgentOutput({
        pipelineRunId: pipelineRun.id,
        agentTaskId: task.id,
        agentType: task.agentType,
        inputSnapshotJson: agentInput,
        outputJson: result.rawOutput,
        normalizedOutputJson: result.normalizedOutput,
        tokenUsageJson: result.metadata?.tokenUsage ?? null,
        latencyMs: result.metadata?.latencyMs ?? null,
        cacheHit: result.metadata?.cacheHit ?? false,
      });

      this.store.updateAgentTask(latestTask.id, {
        status: AgentTaskStatus.SUCCEEDED,
        completedAt: new Date(),
      });
    } catch (error) {
      this.handleTaskFailure(taskId, error);
    }
  }

  private handleTaskFailure(taskId: string, error: unknown) {
    const task = this.store.getAgentTask(taskId);

    const errorJson = {
      message: error instanceof Error ? error.message : 'Unknown error',
      raw: String(error),
      failedAt: new Date().toISOString(),
    };

    if (task.attemptCount < task.maxRetries) {
      this.store.updateAgentTask(task.id, {
        status: AgentTaskStatus.RETRYING,
        errorJson,
      });

      return;
    }

    this.store.updateAgentTask(task.id, {
      status: AgentTaskStatus.FAILED,
      completedAt: new Date(),
      errorJson,
    });
  }
}
