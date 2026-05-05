import { AgentType } from '../common/enums/agent-type.enum';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';

export interface BaseAgent {
  agentType: AgentType;
  run(input: AgentRunInput): Promise<AgentRunOutput>;
}
