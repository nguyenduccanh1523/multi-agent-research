import { Injectable, Logger } from '@nestjs/common';

import { AgentRegistryService } from '../agents/agent-registry.service';
import { AgentTaskStatus } from '../common/enums/agent-task-status.enum';
import { AgentType } from '../common/enums/agent-type.enum';
import { PipelineStatus } from '../common/enums/pipeline-status.enum';
import { ResearchAgentTaskEntity } from '../database/entities/research-agent-task.entity';
import { AggregatorService } from './aggregator.service';
import { DbResearchStore } from './db-research.store';
import { DependencyResolverService } from './dependency-resolver.service';

@Injectable()
export class PipelineRunnerService {
  private readonly logger = new Logger(PipelineRunnerService.name);

  constructor(
    private readonly store: DbResearchStore,
    private readonly agentRegistry: AgentRegistryService,
    private readonly dependencyResolver: DependencyResolverService,
    private readonly aggregator: AggregatorService,
  ) {}

  async runPipeline(pipelineRunId: string) {
    await this.store.updatePipelineRun(pipelineRunId, {
      status: PipelineStatus.RUNNING,
      startedAt: new Date(),
    });

    while (true) {
      const pipelineRun = await this.store.getPipelineRun(pipelineRunId);
      const tasks = await this.store.listAgentTasks(pipelineRunId);

      if (this.dependencyResolver.hasFatalFailure(tasks)) {
        const failedTasks = tasks.filter(
          (task) => task.required && task.status === AgentTaskStatus.FAILED,
        );

        await this.store.updatePipelineRun(pipelineRunId, {
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
        const finalReport = await this.aggregator.aggregateFinalReport(
          pipelineRun.id,
        );

        const hasOptionalFailedTask = tasks.some(
          (task) => !task.required && task.status === AgentTaskStatus.FAILED,
        );

        await this.store.updatePipelineRun(pipelineRunId, {
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
        await this.store.updatePipelineRun(pipelineRunId, {
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
        readyTasks.map(async (task) => {
          await this.store.updateAgentTask(task.id, {
            status: AgentTaskStatus.READY,
          });

          return this.executeAgentTask(task.id);
        }),
      );
    }
  }

  private areAllTasksTerminal(tasks: ResearchAgentTaskEntity[]): boolean {
    const terminalStatuses = [
      AgentTaskStatus.SUCCEEDED,
      AgentTaskStatus.FAILED,
      AgentTaskStatus.SKIPPED,
    ];

    return tasks.every((task) => terminalStatuses.includes(task.status as any));
  }

  private async executeAgentTask(taskId: string): Promise<void> {
    const task = await this.store.getAgentTask(taskId);

    try {
      await this.store.updateAgentTask(task.id, {
        status: AgentTaskStatus.RUNNING,
        startedAt: new Date(),
        attemptCount: task.attemptCount + 1,
        errorJson: null,
      });

      const latestTask = await this.store.getAgentTask(task.id);
      const pipelineRun = await this.store.getPipelineRun(task.pipelineRunId);
      const previousOutputs = await this.store.getPreviousOutputs(
        task.pipelineRunId,
      );

      const agent = this.agentRegistry.getAgent(task.agentType as AgentType);

      const agentInput = {
        pipelineRunId: pipelineRun.id,
        agentTaskId: task.id,
        agentType: task.agentType as AgentType,
        researchInput: pipelineRun.inputJson,
        previousOutputs,
      };

      const result = await agent.run(agentInput);

      if (
        task.agentType === AgentType.COMPANY_RESEARCH_OVERVIEW &&
        result.normalizedOutput?.researchCompanyId
      ) {
        await this.store.updatePipelineRun(pipelineRun.id, {
          researchCompanyId: Number(result.normalizedOutput.researchCompanyId),
        });
      }

      await this.store.createAgentOutput({
        pipelineRunId: pipelineRun.id,
        agentTaskId: task.id,
        agentType: task.agentType as AgentType,
        inputSnapshotJson: agentInput,
        outputJson: result.rawOutput,
        normalizedOutputJson: result.normalizedOutput,
        tokenUsageJson: result.metadata?.tokenUsage ?? null,
        latencyMs: result.metadata?.latencyMs ?? null,
      });

      await this.store.updateAgentTask(latestTask.id, {
        status: AgentTaskStatus.SUCCEEDED,
        completedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(`Agent task failed: ${taskId}`, error as any);
      await this.handleTaskFailure(taskId, error);
    }
  }

  private async handleTaskFailure(taskId: string, error: unknown) {
    const task = await this.store.getAgentTask(taskId);

    const errorJson = {
      message: error instanceof Error ? error.message : 'Unknown error',
      raw: String(error),
      failedAt: new Date().toISOString(),
    };

    if (task.attemptCount < task.maxRetries) {
      await this.store.updateAgentTask(task.id, {
        status: AgentTaskStatus.RETRYING,
        errorJson,
      });

      return;
    }

    await this.store.updateAgentTask(task.id, {
      status: AgentTaskStatus.FAILED,
      completedAt: new Date(),
      errorJson,
    });
  }
}
