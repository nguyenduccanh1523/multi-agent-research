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

  private toDate(value?: Date | string | null): Date | null {
    if (!value) return null;

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  private getDurationMs(
    startedAt?: Date | string | null,
    completedAt?: Date | string | null,
  ): number | null {
    const start = this.toDate(startedAt);

    if (!start) {
      return null;
    }

    const end = this.toDate(completedAt) ?? new Date();

    return Math.max(0, end.getTime() - start.getTime());
  }

  private formatDuration(ms?: number | null): string | null {
    if (ms === null || ms === undefined) {
      return null;
    }

    if (ms < 1000) {
      return `${ms} ms`;
    }

    const seconds = ms / 1000;

    if (seconds < 60) {
      return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)} s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
  }

  private formatAgentTitle(agentType: AgentType | string): string {
    const key = String(agentType);

    const map: Record<string, string> = {
      COMPANY_PROFILE_DB: 'Company Overview',
      COMPANY_RESEARCH_OVERVIEW: 'Company Overview',
      COMPANY_OVERVIEW: 'Company Overview',

      THREE_WHYS_MEDDPIC: '3Whys MEDDPIC',
      THREE_WHY_MEDDPIC: '3Whys MEDDPIC',
      MEDDPIC: '3Whys MEDDPIC',

      PARTNER_COMPETITOR: 'Partner & Competitor',
      PARTNER_AND_COMPETITOR: 'Partner & Competitor',
      PARTNER_COMPETITOR_ANALYSIS: 'Partner & Competitor',

      SCORING: 'Scoring',
      RESEARCH_SCORING: 'Scoring',

      STAKEHOLDER_ANALYSIS: 'Stakeholder Analysis',
      STAKEHOLDER: 'Stakeholder Analysis',
    };

    if (map[key]) {
      return map[key];
    }

    return key
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private getAgentDescription(agentType: AgentType | string): string {
    const key = String(agentType);

    const map: Record<string, string> = {
      COMPANY_PROFILE_DB:
        'Builds the target-company brief, trigger events, tech stack, and financial posture.',
      COMPANY_RESEARCH_OVERVIEW:
        'Builds the target-company brief, trigger events, tech stack, and financial posture.',
      COMPANY_OVERVIEW:
        'Builds the target-company brief, trigger events, tech stack, and financial posture.',

      THREE_WHYS_MEDDPIC:
        'Generates timing, positioning, and qualification angles for outreach teams.',
      THREE_WHY_MEDDPIC:
        'Generates timing, positioning, and qualification angles for outreach teams.',
      MEDDPIC:
        'Generates timing, positioning, and qualification angles for outreach teams.',

      PARTNER_COMPETITOR:
        'Evaluates ecosystem leverage, partner influence, and competitive pressure.',
      PARTNER_AND_COMPETITOR:
        'Evaluates ecosystem leverage, partner influence, and competitive pressure.',
      PARTNER_COMPETITOR_ANALYSIS:
        'Evaluates ecosystem leverage, partner influence, and competitive pressure.',

      SCORING:
        'Scores collaboration fit, execution risk, and strategic viability.',
      RESEARCH_SCORING:
        'Scores collaboration fit, execution risk, and strategic viability.',

      STAKEHOLDER_ANALYSIS:
        'Surfaces relevant stakeholders and enriches the outreach contact list.',
      STAKEHOLDER:
        'Surfaces relevant stakeholders and enriches the outreach contact list.',
    };

    return map[key] ?? 'Runs a research agent and produces structured output.';
  }

  private isTerminalPipelineStatus(status: PipelineStatus | string): boolean {
    return [
      PipelineStatus.SUCCEEDED,
      PipelineStatus.PARTIAL_SUCCESS,
      PipelineStatus.FAILED,
      PipelineStatus.CANCELLED,
    ].includes(status as PipelineStatus);
  }

  private isTerminalTaskStatus(status: AgentTaskStatus | string): boolean {
    return [
      AgentTaskStatus.SUCCEEDED,
      AgentTaskStatus.FAILED,
      AgentTaskStatus.SKIPPED,
    ].includes(status as AgentTaskStatus);
  }

  private getProgressHeadline(params: {
    status: PipelineStatus | string;
    failedCount: number;
    succeededCount: number;
    total: number;
  }): string {
    if (params.status === PipelineStatus.SUCCEEDED) {
      return 'Completed';
    }

    if (params.status === PipelineStatus.PARTIAL_SUCCESS) {
      return 'Completed with warnings';
    }

    if (params.status === PipelineStatus.FAILED) {
      return 'Failed';
    }

    if (params.status === PipelineStatus.CANCELLED) {
      return 'Cancelled';
    }

    if (params.status === PipelineStatus.QUEUED) {
      return 'Queued';
    }

    if (params.succeededCount > 0 || params.failedCount > 0) {
      return 'Running';
    }

    return 'Preparing';
  }

  private getProgressSubtitle(params: {
    status: PipelineStatus | string;
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    running: number;
    ready: number;
    outputCount: number;
  }): string {
    if (params.status === PipelineStatus.SUCCEEDED) {
      return 'The final research packet is ready for review, sharing, and action planning.';
    }

    if (params.status === PipelineStatus.PARTIAL_SUCCESS) {
      return 'The pipeline finished, but some optional agents failed or were skipped.';
    }

    if (params.status === PipelineStatus.FAILED) {
      return 'The pipeline stopped because one or more required agents failed.';
    }

    if (params.status === PipelineStatus.CANCELLED) {
      return 'The pipeline was cancelled before completion.';
    }

    if (params.status === PipelineStatus.QUEUED) {
      return 'The research pipeline is queued and waiting to start.';
    }

    if (params.running > 0) {
      return `${params.running} agent(s) are running. ${params.outputCount} output(s) are ready.`;
    }

    if (params.ready > 0) {
      return `${params.ready} agent(s) are ready to run.`;
    }

    return `${params.succeeded + params.failed + params.skipped}/${params.total} agent(s) finished.`;
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

    const isCompleted = this.isTerminalPipelineStatus(pipelineRun.status);

    const progressPercent =
      total === 0
        ? isCompleted
          ? 100
          : 0
        : Math.min(100, Math.round((terminalCount / total) * 100));

    const currentAgents = Array.from(
      new Set([
        ...running.map((task) => task.agentType),
        ...retrying.map((task) => task.agentType),
        ...ready.map((task) => task.agentType),
      ]),
    );

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
          String(task.agentType),
        ),
      )
    ) {
      currentStage = 'BASE_AGENTS_RUNNING';
    } else if (running.length > 0 || retrying.length > 0 || ready.length > 0) {
      currentStage = 'SELECTED_AGENTS_RUNNING';
    } else if (terminalCount === total && total > 0) {
      currentStage = 'AGGREGATING';
    }

    const pipelineStartedAt =
      pipelineRun.startedAt ?? (pipelineRun as any).createdAt ?? null;

    const elapsedMs = this.getDurationMs(
      pipelineStartedAt,
      pipelineRun.completedAt,
    );

    const outputByTaskId = new Map(
      outputs.map((output) => [output.agentTaskId, output]),
    );

    const headline = this.getProgressHeadline({
      status: pipelineRun.status,
      failedCount: failed.length,
      succeededCount: succeeded.length,
      total,
    });

    const subtitle = this.getProgressSubtitle({
      status: pipelineRun.status,
      total,
      succeeded: succeeded.length,
      failed: failed.length,
      skipped: skipped.length,
      running: running.length,
      ready: ready.length,
      outputCount: outputs.length,
    });

    const taskCards = tasks.map((task) => {
      const output = outputByTaskId.get(task.id) ?? null;

      const durationMs = this.getDurationMs(task.startedAt, task.completedAt);

      return {
        id: task.id,
        agentType: task.agentType,

        title: this.formatAgentTitle(task.agentType),
        description: this.getAgentDescription(task.agentType),

        status: task.status,
        isTerminal: this.isTerminalTaskStatus(task.status),

        dependsOn: task.dependsOn,
        dependsOnLabels: task.dependsOn?.map((item) =>
          this.formatAgentTitle(item),
        ),

        required: task.required,
        mode: task.required ? 'Required' : 'Optional',

        attemptCount: task.attemptCount,
        maxRetries: task.maxRetries,
        attemptLabel: `${task.attemptCount}/${task.maxRetries}`,

        startedAt: task.startedAt,
        completedAt: task.completedAt,

        durationMs,
        durationLabel: this.formatDuration(durationMs),

        hasOutput: Boolean(output),
        outputStatus: output ? 'Ready' : 'Waiting',
        outputId: output?.id ?? null,

        errorJson: task.errorJson,
      };
    });

    return {
      pipelineRunId: pipelineRun.id,
      batchId: pipelineRun.batchId,
      mode: pipelineRun.mode,
      status: pipelineRun.status,
      researchCompanyId: pipelineRun.researchCompanyId,

      headline,
      subtitle,

      progressPercent,
      isCompleted,
      currentStage,
      currentAgents,

      summary: {
        total,
        done: terminalCount,
        doneLabel: `${terminalCount}/${total}`,

        pending: pending.length,
        ready: ready.length,
        running: running.length,
        retrying: retrying.length,
        succeeded: succeeded.length,
        failed: failed.length,
        skipped: skipped.length,

        outputCount: outputs.length,
      },

      timing: {
        startedAt: pipelineStartedAt,
        completedAt: pipelineRun.completedAt,
        elapsedMs,
        elapsedLabel: this.formatDuration(elapsedMs),
        lastUpdatedAt: new Date().toISOString(),
      },

      startedAt: pipelineStartedAt,
      completedAt: pipelineRun.completedAt,
      elapsedMs,
      elapsedLabel: this.formatDuration(elapsedMs),

      errorJson: pipelineRun.errorJson,

      polling: {
        shouldContinue: !isCompleted,
        recommendedIntervalMs: isCompleted ? null : 1000,
      },

      tasks: taskCards,
      cards: taskCards,

      outputs: outputs.map((output) => ({
        id: output.id,
        agentTaskId: output.agentTaskId,
        agentType: output.agentType,
        title: this.formatAgentTitle(output.agentType),
        createdAt: output.createdAt,
        latencyMs: output.latencyMs,
      })),

      finalOutputReady: Boolean(pipelineRun.finalOutputJson),

      finalOutputJson: pipelineRun.finalOutputJson ?? null,

      result: {
        finalOutputReady: Boolean(pipelineRun.finalOutputJson),
        finalOutputJson: pipelineRun.finalOutputJson ?? null,
      },
    };
  }

  async getUserPipelineHistory(params: {
    userId: number;
    page?: number;
    pageSize?: number;
    status?: string;
    mode?: string;
  }) {
    const page = Math.max(Number(params.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize ?? 10), 1), 50);

    const where: Record<string, any> = {
      userId: params.userId,
    };

    if (params.status?.trim()) {
      where.status = params.status.trim();
    }

    if (params.mode?.trim()) {
      where.mode = params.mode.trim();
    }

    const [pipelineRuns, total] = await this.pipelineRepo.findAndCount({
      where,
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const items = await Promise.all(
      pipelineRuns.map(async (pipelineRun) => {
        const tasks = await this.listAgentTasks(pipelineRun.id);
        const outputCount = await this.outputRepo.count({
          where: {
            pipelineRunId: pipelineRun.id,
          },
        });

        const totalTasks = tasks.length;

        const succeeded = tasks.filter(
          (task) => task.status === AgentTaskStatus.SUCCEEDED,
        ).length;

        const failed = tasks.filter(
          (task) => task.status === AgentTaskStatus.FAILED,
        ).length;

        const skipped = tasks.filter(
          (task) => task.status === AgentTaskStatus.SKIPPED,
        ).length;

        const running = tasks.filter(
          (task) => task.status === AgentTaskStatus.RUNNING,
        ).length;

        const retrying = tasks.filter(
          (task) => task.status === AgentTaskStatus.RETRYING,
        ).length;

        const ready = tasks.filter(
          (task) => task.status === AgentTaskStatus.READY,
        ).length;

        const pending = tasks.filter(
          (task) => task.status === AgentTaskStatus.PENDING,
        ).length;

        const done = succeeded + failed + skipped;

        const progressPercent =
          totalTasks === 0 ? 0 : Math.round((done / totalTasks) * 100);

        const companyName =
          pipelineRun.inputJson?.company_name ??
          pipelineRun.inputJson?.companyName ??
          pipelineRun.inputJson?.name ??
          pipelineRun.inputJson?.target_company ??
          null;

        return {
          pipelineRunId: pipelineRun.id,
          batchId: pipelineRun.batchId,
          mode: pipelineRun.mode,
          status: pipelineRun.status,
          userId: pipelineRun.userId,
          researchCompanyId: pipelineRun.researchCompanyId,

          title: companyName
            ? `${companyName} research`
            : `Research pipeline ${pipelineRun.id.slice(0, 8)}`,

          companyName,

          progress: {
            percent: progressPercent,
            done,
            total: totalTasks,
            doneLabel: `${done}/${totalTasks}`,
          },

          summary: {
            total: totalTasks,
            pending,
            ready,
            running,
            retrying,
            succeeded,
            failed,
            skipped,
            outputCount,
          },

          timing: {
            createdAt: pipelineRun.createdAt,
            startedAt: pipelineRun.startedAt,
            completedAt: pipelineRun.completedAt,
            updatedAt: pipelineRun.updatedAt,
          },

          hasFinalOutput: Boolean(pipelineRun.finalOutputJson),
          hasError: Boolean(pipelineRun.errorJson),

          links: {
            progress: `/research/pipelines/${pipelineRun.id}/progress`,
            detail: `/research/pipelines/${pipelineRun.id}`,
          },
        };
      }),
    );

    return {
      data: items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
      filters: {
        userId: params.userId,
        status: params.status ?? null,
        mode: params.mode ?? null,
      },
    };
  }
}
