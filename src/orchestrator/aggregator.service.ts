import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { InMemoryResearchStore } from './in-memory-research.store';
import { ResearchPipelineRunRecord } from './types/pipeline-records.types';

@Injectable()
export class AggregatorService {
  constructor(private readonly store: InMemoryResearchStore) {}

  aggregateFinalReport(pipelineRun: ResearchPipelineRunRecord) {
    const previousOutputs = this.store.getPreviousOutputs(pipelineRun.id);

    const companyProfile =
      previousOutputs[AgentType.COMPANY_PROFILE_DB] ?? null;

    const overview = previousOutputs[AgentType.COMPANY_RESEARCH_OVERVIEW] ?? {
      companyName: pipelineRun.inputJson.name,
      website: pipelineRun.inputJson.url,
      focusOn: pipelineRun.inputJson.focus_on,
      level: pipelineRun.inputJson.level,
    };

    const finalReport = {
      overview,

      analysis: previousOutputs[AgentType.THREE_WHYS_MEDDPIC] ?? null,

      partnerCompetitorInsight:
        previousOutputs[AgentType.PARTNER_COMPETITOR] ?? null,

      contact: previousOutputs[AgentType.CONTACT_ENRICHMENT] ?? null,

      scoring: previousOutputs[AgentType.SCORING] ?? null,

      metadata: {
        pipelineRunId: pipelineRun.id,
        batchId: pipelineRun.batchId,
        mode: pipelineRun.mode,
        requestedTools: pipelineRun.inputJson.selected_tools ?? ['ALL'],
        completedAt: new Date().toISOString(),
        completedAgents: Object.keys(previousOutputs),
        internal: {
          companyProfile,
        },
      },
    };

    this.store.updatePipelineRun(pipelineRun.id, {
      finalOutputJson: finalReport,
    });

    this.store.createResearchHistory({
      pipelineRunId: pipelineRun.id,
      batchId: pipelineRun.batchId,
      mode: pipelineRun.mode,
      companyName: pipelineRun.inputJson.name ?? null,
      website: pipelineRun.inputJson.url ?? null,
      finalReportJson: finalReport,
    });

    return finalReport;
  }

  aggregateBatchResult(batchId: string) {
    const histories = this.store.listHistoriesByBatch(batchId);

    return {
      batchId,
      total: histories.length,
      results: histories.map((history) => ({
        historyId: history.id,
        pipelineRunId: history.pipelineRunId,
        companyName: history.companyName,
        website: history.website,
        finalReport: history.finalReportJson,
      })),
    };
  }
}
