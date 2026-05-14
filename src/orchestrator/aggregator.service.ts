import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { DbResearchStore } from './db-research.store';

@Injectable()
export class AggregatorService {
  constructor(private readonly store: DbResearchStore) {}

  async aggregateFinalReport(pipelineRunId: string) {
    const pipelineRun = await this.store.getPipelineRun(pipelineRunId);
    const previousOutputs = await this.store.getPreviousOutputs(pipelineRunId);

    const finalReport = {
      overview: previousOutputs[AgentType.COMPANY_RESEARCH_OVERVIEW] ?? {},

      analysis: previousOutputs[AgentType.THREE_WHYS_MEDDPIC] ?? {},

      partnerCompetitorInsight:
        previousOutputs[AgentType.PARTNER_COMPETITOR] ?? {},

      contact: previousOutputs[AgentType.CONTACT_ENRICHMENT] ?? {},

      scoring: previousOutputs[AgentType.SCORING] ?? {},

      metadata: {
        pipelineRunId: pipelineRun.id,
        batchId: pipelineRun.batchId,
        mode: pipelineRun.mode,
        requestedTools: pipelineRun.inputJson.selected_tools ?? ['ALL'],
        researchCompanyId: pipelineRun.researchCompanyId,
        completedAgents: Object.keys(previousOutputs),
        completedAt: new Date().toISOString(),
        internal: {
          companyProfile: previousOutputs[AgentType.COMPANY_PROFILE_DB] ?? {},
        },
      },
    };

    await this.store.updatePipelineRun(pipelineRunId, {
      finalOutputJson: finalReport,
    });

    return finalReport;
  }
}
