import { Injectable } from '@nestjs/common';

import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { StartMultiResearchDto } from './dto/start-multi-research.dto';
import { StartSingleResearchDto } from './dto/start-single-research.dto';

@Injectable()
export class ResearchService {
  constructor(private readonly orchestrator: OrchestratorService) {}

  startSingleResearch(dto: StartSingleResearchDto) {
    return this.orchestrator.startSingleResearch(dto);
  }

  startMultiResearch(dto: StartMultiResearchDto) {
    const companies = dto.companies.map((company) => ({
      ...company,
      selected_tools: company.selected_tools?.length
        ? company.selected_tools
        : dto.selected_tools,
    }));

    return this.orchestrator.startMultiResearch({
      companies,
    });
  }

  getPipeline(pipelineRunId: string) {
    return this.orchestrator.getPipeline(pipelineRunId);
  }

  getBatch(batchId: string) {
    return this.orchestrator.getBatch(batchId);
  }

  getCompanyCache() {
    return this.orchestrator.getCompanyCache();
  }

  clearCompanyCache() {
    return this.orchestrator.clearCompanyCache();
  }
}
