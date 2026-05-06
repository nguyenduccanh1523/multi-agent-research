import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { AgentTaskStatus } from '../common/enums/agent-task-status.enum';
import { AgentType } from '../common/enums/agent-type.enum';
import { PipelineStatus } from '../common/enums/pipeline-status.enum';
import { ResearchMode } from '../common/enums/research-mode.enum';
import { ResearchAgentOutputEntity } from '../database/entities/research-agent-output.entity';
import { ResearchAgentTaskEntity } from '../database/entities/research-agent-task.entity';
import { ResearchPipelineRunEntity } from '../database/entities/research-pipeline-run.entity';

@Injectable()
export class DbResearchStore {
  constructor(
    @InjectRepository(ResearchPipelineRunEntity)
    private readonly pipelineRepo: Repository<ResearchPipelineRunEntity>,

    @InjectRepository(ResearchAgentTaskEntity)
    private readonly taskRepo: Repository<ResearchAgentTaskEntity>,

    @InjectRepository(ResearchAgentOutputEntity)
    private readonly outputRepo: Repository<ResearchAgentOutputEntity>,
  ) {}

  async createPipelineRun(params: {
    batchId?: string | null;
    mode: ResearchMode;
    userId: number;
    inputJson: Record<string, any>;
  }) {
    const row = this.pipelineRepo.create({
      id: uuidv4(),
      batchId: params.batchId ?? null,
      mode: params.mode,
      status: PipelineStatus.QUEUED,
      userId: params.userId,
      inputJson: params.inputJson,
      finalOutputJson: null,
      errorJson: null,
    });

    return this.pipelineRepo.save(row);
  }

  async updatePipelineRun(
    pipelineRunId: string,
    patch: Partial<ResearchPipelineRunEntity>,
  ) {
    await this.pipelineRepo.update({ id: pipelineRunId }, patch);
    return this.getPipelineRun(pipelineRunId);
  }

  async getPipelineRun(pipelineRunId: string) {
    const row = await this.pipelineRepo.findOne({
      where: { id: pipelineRunId },
    });

    if (!row) {
      throw new NotFoundException(`Pipeline run not found: ${pipelineRunId}`);
    }

    return row;
  }

  async listPipelineRunsByBatch(batchId: string) {
    return this.pipelineRepo.find({
      where: { batchId },
      order: { createdAt: 'ASC' },
    });
  }

  async createAgentTask(params: {
    pipelineRunId: string;
    agentType: AgentType;
    dependsOn: AgentType[];
    required: boolean;
    maxRetries: number;
  }) {
    const task = this.taskRepo.create({
      id: uuidv4(),
      pipelineRunId: params.pipelineRunId,
      agentType: params.agentType,
      status: AgentTaskStatus.PENDING,
      dependsOn: params.dependsOn,
      required: params.required,
      attemptCount: 0,
      maxRetries: params.maxRetries,
    });

    return this.taskRepo.save(task);
  }

  async updateAgentTask(
    taskId: string,
    patch: Partial<ResearchAgentTaskEntity>,
  ) {
    await this.taskRepo.update({ id: taskId }, patch);
    return this.getAgentTask(taskId);
  }

  async getAgentTask(taskId: string) {
    const row = await this.taskRepo.findOne({
      where: { id: taskId },
    });

    if (!row) {
      throw new NotFoundException(`Agent task not found: ${taskId}`);
    }

    return row;
  }

  async listAgentTasks(pipelineRunId: string) {
    return this.taskRepo.find({
      where: { pipelineRunId },
      order: { createdAt: 'ASC' },
    });
  }

  async createAgentOutput(params: {
    pipelineRunId: string;
    agentTaskId: string;
    agentType: AgentType;
    inputSnapshotJson: Record<string, any>;
    outputJson: Record<string, any>;
    normalizedOutputJson: Record<string, any>;
    tokenUsageJson?: Record<string, any> | null;
    latencyMs?: number | null;
  }) {
    const output = this.outputRepo.create({
      id: uuidv4(),
      pipelineRunId: params.pipelineRunId,
      agentTaskId: params.agentTaskId,
      agentType: params.agentType,
      inputSnapshotJson: params.inputSnapshotJson,
      outputJson: params.outputJson,
      normalizedOutputJson: params.normalizedOutputJson,
      tokenUsageJson: params.tokenUsageJson ?? null,
      latencyMs: params.latencyMs ?? null,
    });

    return this.outputRepo.save(output);
  }

  async listAgentOutputs(pipelineRunId: string) {
    return this.outputRepo.find({
      where: { pipelineRunId },
      order: { createdAt: 'ASC' },
    });
  }

  async getPreviousOutputs(pipelineRunId: string) {
    const outputs = await this.listAgentOutputs(pipelineRunId);

    return outputs.reduce<Record<string, Record<string, any>>>(
      (acc, output) => {
        acc[output.agentType] = output.normalizedOutputJson;
        return acc;
      },
      {},
    );
  }

  async getPipelineSnapshot(pipelineRunId: string) {
    return {
      pipelineRun: await this.getPipelineRun(pipelineRunId),
      tasks: await this.listAgentTasks(pipelineRunId),
      outputs: await this.listAgentOutputs(pipelineRunId),
    };
  }

  async getBatchSnapshot(batchId: string) {
    const pipelines = await this.listPipelineRunsByBatch(batchId);

    const pipelineSnapshots = await Promise.all(
      pipelines.map((pipeline) => this.getPipelineSnapshot(pipeline.id)),
    );

    return {
      batchId,
      total: pipelines.length,
      pipelines: pipelineSnapshots,
    };
  }

  async getPipelineProgress(pipelineRunId: string) {
    const pipelineRun = await this.getPipelineRun(pipelineRunId);
    const tasks = await this.listAgentTasks(pipelineRunId);
    const outputs = await this.listAgentOutputs(pipelineRunId);

    const total = tasks.length;

    const pending = tasks.filter(
      (task) => task.status === AgentTaskStatus.PENDING,
    );

    const ready = tasks.filter((task) => task.status === AgentTaskStatus.READY);

    const running = tasks.filter(
      (task) => task.status === AgentTaskStatus.RUNNING,
    );

    const retrying = tasks.filter(
      (task) => task.status === AgentTaskStatus.RETRYING,
    );

    const succeeded = tasks.filter(
      (task) => task.status === AgentTaskStatus.SUCCEEDED,
    );

    const failed = tasks.filter(
      (task) => task.status === AgentTaskStatus.FAILED,
    );

    const skipped = tasks.filter(
      (task) => task.status === AgentTaskStatus.SKIPPED,
    );

    const terminalCount = succeeded.length + failed.length + skipped.length;

    const progressPercent =
      total === 0 ? 0 : Math.round((terminalCount / total) * 100);

    const isCompleted = [
      PipelineStatus.SUCCEEDED,
      PipelineStatus.PARTIAL_SUCCESS,
      PipelineStatus.FAILED,
      PipelineStatus.CANCELLED,
    ].includes(pipelineRun.status as PipelineStatus);

    const currentAgents = [
      ...running.map((task) => task.agentType),
      ...ready.map((task) => task.agentType),
      ...retrying.map((task) => task.agentType),
    ];

    const failedRequiredTasks = failed.filter((task) => task.required);

    let currentStage = 'WAITING';

    if (pipelineRun.status === PipelineStatus.QUEUED) {
      currentStage = 'QUEUED';
    } else if (failedRequiredTasks.length > 0) {
      currentStage = 'FAILED';
    } else if (isCompleted) {
      currentStage = 'COMPLETED';
    } else if (
      running.some((task) =>
        ['COMPANY_PROFILE_DB', 'COMPANY_RESEARCH_OVERVIEW'].includes(
          task.agentType,
        ),
      )
    ) {
      currentStage = 'BASE_AGENTS_RUNNING';
    } else if (running.length > 0 || ready.length > 0) {
      currentStage = 'SELECTED_AGENTS_RUNNING';
    } else if (succeeded.length === total && total > 0) {
      currentStage = 'AGGREGATING';
    }

    return {
      pipelineRunId: pipelineRun.id,
      batchId: pipelineRun.batchId,
      mode: pipelineRun.mode,
      status: pipelineRun.status,
      researchCompanyId: pipelineRun.researchCompanyId,

      progressPercent,
      isCompleted,
      currentStage,
      currentAgents,

      summary: {
        total,
        pending: pending.length,
        ready: ready.length,
        running: running.length,
        retrying: retrying.length,
        succeeded: succeeded.length,
        failed: failed.length,
        skipped: skipped.length,
        outputCount: outputs.length,
      },

      startedAt: pipelineRun.startedAt,
      completedAt: pipelineRun.completedAt,
      errorJson: pipelineRun.errorJson,

      tasks: tasks.map((task) => ({
        id: task.id,
        agentType: task.agentType,
        status: task.status,
        dependsOn: task.dependsOn,
        required: task.required,
        attemptCount: task.attemptCount,
        maxRetries: task.maxRetries,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        errorJson: task.errorJson,
      })),

      outputs: outputs.map((output) => ({
        id: output.id,
        agentType: output.agentType,
        createdAt: output.createdAt,
      })),

      finalOutputReady: Boolean(pipelineRun.finalOutputJson),
    };
  }
}
