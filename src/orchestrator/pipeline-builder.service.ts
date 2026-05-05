import { Injectable } from '@nestjs/common';

import { ResearchMode } from '../common/enums/research-mode.enum';
import { ResearchTool } from '../common/enums/research-tool.enum';
import { InMemoryResearchStore } from './in-memory-research.store';
import { buildResearchPipelineGraph } from './research-pipeline.graph';

@Injectable()
export class PipelineBuilderService {
  constructor(private readonly store: InMemoryResearchStore) {}

  createPipeline(params: {
    mode: ResearchMode;
    batchId?: string | null;
    inputJson: Record<string, any>;
    selectedTools?: ResearchTool[];
  }) {
    const pipelineRun = this.store.createPipelineRun({
      mode: params.mode,
      batchId: params.batchId ?? null,
      inputJson: params.inputJson,
    });

    const graph = buildResearchPipelineGraph(params.selectedTools);

    for (const node of graph) {
      this.store.createAgentTask({
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