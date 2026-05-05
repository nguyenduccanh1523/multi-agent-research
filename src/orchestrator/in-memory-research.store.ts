import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { AgentTaskStatus } from '../common/enums/agent-task-status.enum';
import { AgentType } from '../common/enums/agent-type.enum';
import { PipelineStatus } from '../common/enums/pipeline-status.enum';
import { ResearchMode } from '../common/enums/research-mode.enum';
import {
  ResearchAgentOutputRecord,
  ResearchAgentTaskRecord,
  ResearchBatchRecord,
  ResearchHistoryRecord,
  ResearchPipelineRunRecord,
} from './types/pipeline-records.types';

@Injectable()
export class InMemoryResearchStore {
  private readonly pipelineRuns = new Map<string, ResearchPipelineRunRecord>();
  private readonly agentTasks = new Map<string, ResearchAgentTaskRecord>();
  private readonly agentOutputs = new Map<string, ResearchAgentOutputRecord>();
  private readonly histories = new Map<string, ResearchHistoryRecord>();
  private readonly batches = new Map<string, ResearchBatchRecord>();

  createBatch(totalCount: number): ResearchBatchRecord {
    const now = new Date();

    const batch: ResearchBatchRecord = {
      id: uuidv4(),
      status: PipelineStatus.QUEUED,
      totalCount,
      successCount: 0,
      failedCount: 0,
      finalOutputJson: null,
      createdAt: now,
      completedAt: null,
      updatedAt: now,
    };

    this.batches.set(batch.id, batch);

    return batch;
  }

  updateBatch(
    batchId: string,
    patch: Partial<ResearchBatchRecord>,
  ): ResearchBatchRecord {
    const batch = this.getBatch(batchId);

    const updated = {
      ...batch,
      ...patch,
      updatedAt: new Date(),
    };

    this.batches.set(batchId, updated);

    return updated;
  }

  getBatch(batchId: string): ResearchBatchRecord {
    const batch = this.batches.get(batchId);

    if (!batch) {
      throw new NotFoundException(`Batch not found: ${batchId}`);
    }

    return batch;
  }

  createPipelineRun(params: {
    batchId?: string | null;
    mode: ResearchMode;
    inputJson: Record<string, any>;
  }): ResearchPipelineRunRecord {
    const now = new Date();

    const pipelineRun: ResearchPipelineRunRecord = {
      id: uuidv4(),
      batchId: params.batchId ?? null,
      mode: params.mode,
      status: PipelineStatus.QUEUED,
      inputJson: params.inputJson,
      finalOutputJson: null,
      errorJson: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.pipelineRuns.set(pipelineRun.id, pipelineRun);

    return pipelineRun;
  }

  updatePipelineRun(
    pipelineRunId: string,
    patch: Partial<ResearchPipelineRunRecord>,
  ): ResearchPipelineRunRecord {
    const pipelineRun = this.getPipelineRun(pipelineRunId);

    const updated = {
      ...pipelineRun,
      ...patch,
      updatedAt: new Date(),
    };

    this.pipelineRuns.set(pipelineRunId, updated);

    return updated;
  }

  getPipelineRun(pipelineRunId: string): ResearchPipelineRunRecord {
    const pipelineRun = this.pipelineRuns.get(pipelineRunId);

    if (!pipelineRun) {
      throw new NotFoundException(`Pipeline run not found: ${pipelineRunId}`);
    }

    return pipelineRun;
  }

  listPipelineRunsByBatch(batchId: string): ResearchPipelineRunRecord[] {
    return Array.from(this.pipelineRuns.values()).filter(
      (item) => item.batchId === batchId,
    );
  }

  createAgentTask(params: {
    pipelineRunId: string;
    agentType: AgentType;
    dependsOn: AgentType[];
    required: boolean;
    maxRetries: number;
  }): ResearchAgentTaskRecord {
    const now = new Date();

    const task: ResearchAgentTaskRecord = {
      id: uuidv4(),
      pipelineRunId: params.pipelineRunId,
      agentType: params.agentType,
      status: AgentTaskStatus.PENDING,
      dependsOn: params.dependsOn,
      required: params.required,
      attemptCount: 0,
      maxRetries: params.maxRetries,
      startedAt: null,
      completedAt: null,
      errorJson: null,
      createdAt: now,
      updatedAt: now,
    };

    this.agentTasks.set(task.id, task);

    return task;
  }

  updateAgentTask(
    taskId: string,
    patch: Partial<ResearchAgentTaskRecord>,
  ): ResearchAgentTaskRecord {
    const task = this.getAgentTask(taskId);

    const updated = {
      ...task,
      ...patch,
      updatedAt: new Date(),
    };

    this.agentTasks.set(taskId, updated);

    return updated;
  }

  getAgentTask(taskId: string): ResearchAgentTaskRecord {
    const task = this.agentTasks.get(taskId);

    if (!task) {
      throw new NotFoundException(`Agent task not found: ${taskId}`);
    }

    return task;
  }

  listAgentTasks(pipelineRunId: string): ResearchAgentTaskRecord[] {
    return Array.from(this.agentTasks.values()).filter(
      (item) => item.pipelineRunId === pipelineRunId,
    );
  }

  createAgentOutput(params: {
    pipelineRunId: string;
    agentTaskId: string;
    agentType: AgentType;
    inputSnapshotJson: Record<string, any>;
    outputJson: Record<string, any>;
    normalizedOutputJson: Record<string, any>;
    tokenUsageJson?: Record<string, any> | null;
    latencyMs?: number | null;
    cacheHit?: boolean;
  }): ResearchAgentOutputRecord {
    const output: ResearchAgentOutputRecord = {
      id: uuidv4(),
      pipelineRunId: params.pipelineRunId,
      agentTaskId: params.agentTaskId,
      agentType: params.agentType,
      inputSnapshotJson: params.inputSnapshotJson,
      outputJson: params.outputJson,
      normalizedOutputJson: params.normalizedOutputJson,
      tokenUsageJson: params.tokenUsageJson ?? null,
      latencyMs: params.latencyMs ?? null,
      cacheHit: params.cacheHit ?? false,
      createdAt: new Date(),
    };

    this.agentOutputs.set(output.id, output);

    return output;
  }

  listAgentOutputs(pipelineRunId: string): ResearchAgentOutputRecord[] {
    return Array.from(this.agentOutputs.values()).filter(
      (item) => item.pipelineRunId === pipelineRunId,
    );
  }

  getPreviousOutputs(
    pipelineRunId: string,
  ): Record<string, Record<string, any>> {
    const outputs = this.listAgentOutputs(pipelineRunId);

    return outputs.reduce<Record<string, Record<string, any>>>(
      (acc, output) => {
        acc[output.agentType] = output.normalizedOutputJson;
        return acc;
      },
      {},
    );
  }

  createResearchHistory(params: {
    pipelineRunId: string;
    batchId?: string | null;
    mode: ResearchMode;
    companyName?: string | null;
    website?: string | null;
    finalReportJson: Record<string, any>;
  }): ResearchHistoryRecord {
    const history: ResearchHistoryRecord = {
      id: uuidv4(),
      pipelineRunId: params.pipelineRunId,
      batchId: params.batchId ?? null,
      mode: params.mode,
      companyName: params.companyName ?? null,
      website: params.website ?? null,
      finalReportJson: params.finalReportJson,
      createdAt: new Date(),
    };

    this.histories.set(history.id, history);

    return history;
  }

  listHistoriesByBatch(batchId: string): ResearchHistoryRecord[] {
    return Array.from(this.histories.values()).filter(
      (item) => item.batchId === batchId,
    );
  }

  getPipelineSnapshot(pipelineRunId: string) {
    return {
      pipelineRun: this.getPipelineRun(pipelineRunId),
      tasks: this.listAgentTasks(pipelineRunId),
      outputs: this.listAgentOutputs(pipelineRunId),
    };
  }

  getBatchSnapshot(batchId: string) {
    return {
      batch: this.getBatch(batchId),
      pipelines: this.listPipelineRunsByBatch(batchId),
      histories: this.listHistoriesByBatch(batchId),
    };
  }
}
