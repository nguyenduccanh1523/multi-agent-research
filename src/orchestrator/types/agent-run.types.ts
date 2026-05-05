import { AgentType } from '../../common/enums/agent-type.enum';

export type JsonObject = Record<string, any>;

export interface AgentRunInput {
  pipelineRunId: string;
  agentTaskId: string;
  agentType: AgentType;
  researchInput: JsonObject;
  previousOutputs: Record<string, JsonObject>;
}

export interface AgentRunOutput {
  rawOutput: JsonObject;
  normalizedOutput: JsonObject;
  metadata?: {
    model?: string;
    tokenUsage?: JsonObject;
    latencyMs?: number;
    cacheHit?: boolean;
  };
}
