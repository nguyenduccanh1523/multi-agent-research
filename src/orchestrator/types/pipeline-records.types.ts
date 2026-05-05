import { AgentTaskStatus } from '../../common/enums/agent-task-status.enum';
import { AgentType } from '../../common/enums/agent-type.enum';
import { PipelineStatus } from '../../common/enums/pipeline-status.enum';
import { ResearchMode } from '../../common/enums/research-mode.enum';

export interface ResearchPipelineRunRecord {
  id: string;
  batchId?: string | null;
  mode: ResearchMode;
  status: PipelineStatus;
  inputJson: Record<string, any>;
  finalOutputJson?: Record<string, any> | null;
  errorJson?: Record<string, any> | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchAgentTaskRecord {
  id: string;
  pipelineRunId: string;
  agentType: AgentType;
  status: AgentTaskStatus;
  dependsOn: AgentType[];
  required: boolean;
  attemptCount: number;
  maxRetries: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  errorJson?: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchAgentOutputRecord {
  id: string;
  pipelineRunId: string;
  agentTaskId: string;
  agentType: AgentType;
  inputSnapshotJson: Record<string, any>;
  outputJson: Record<string, any>;
  normalizedOutputJson: Record<string, any>;
  tokenUsageJson?: Record<string, any> | null;
  latencyMs?: number | null;
  cacheHit?: boolean;
  createdAt: Date;
}

export interface ResearchHistoryRecord {
  id: string;
  pipelineRunId: string;
  batchId?: string | null;
  mode: ResearchMode;
  companyName?: string | null;
  website?: string | null;
  finalReportJson: Record<string, any>;
  createdAt: Date;
}

export interface ResearchBatchRecord {
  id: string;
  status: PipelineStatus;
  totalCount: number;
  successCount: number;
  failedCount: number;
  finalOutputJson?: Record<string, any> | null;
  createdAt: Date;
  completedAt?: Date | null;
  updatedAt: Date;
}
