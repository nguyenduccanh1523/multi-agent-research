import { Injectable } from '@nestjs/common';

import { ResearchMode } from '../common/enums/research-mode.enum';
import { ResearchTool } from '../common/enums/research-tool.enum';
import { DbResearchStore } from './db-research.store';
import { buildResearchPipelineGraph } from './research-pipeline.graph';

@Injectable()
export class PipelineBuilderService {
  constructor(private readonly store: DbResearchStore) {}

  async createPipeline(params: {
    mode: ResearchMode;
    batchId?: string | null;
    userId: number;
    inputJson: Record<string, any>;
    selectedTools?: ResearchTool[];
  }) {
    const pipelineRun = await this.store.createPipelineRun({
      mode: params.mode,
      batchId: params.batchId ?? null,
      userId: params.userId,
      inputJson: params.inputJson,
    });

    const graph = buildResearchPipelineGraph(params.selectedTools);

    for (const node of graph) {
      await this.store.createAgentTask({
        pipelineRunId: pipelineRun.id,
        agentType: node.agentType,
        dependsOn: node.dependsOn,
        required: node.required,
        maxRetries: node.maxRetries,
      });
    }

    return pipelineRun;
  }
}
