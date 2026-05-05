import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';

import { StartMultiResearchDto } from './dto/start-multi-research.dto';
import { StartSingleResearchDto } from './dto/start-single-research.dto';
import { ResearchService } from './research.service';

@Controller('research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Post('single')
  startSingleResearch(@Body() dto: StartSingleResearchDto) {
    return this.researchService.startSingleResearch(dto);
  }

  @Post('multi')
  startMultiResearch(@Body() dto: StartMultiResearchDto) {
    return this.researchService.startMultiResearch(dto);
  }

  @Get('pipelines/:pipelineRunId')
  getPipeline(@Param('pipelineRunId') pipelineRunId: string) {
    return this.researchService.getPipeline(pipelineRunId);
  }

  @Get('batches/:batchId')
  getBatch(@Param('batchId') batchId: string) {
    return this.researchService.getBatch(batchId);
  }

  @Get('company-cache')
  getCompanyCache() {
    return this.researchService.getCompanyCache();
  }

  @Delete('company-cache')
  clearCompanyCache() {
    return this.researchService.clearCompanyCache();
  }
}
