import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  ParseIntPipe,
  Query,
  DefaultValuePipe,
} from '@nestjs/common';

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

  @Get('cache/company-profile/:userId')
  getCompanyProfileCacheDebug(@Param('userId', ParseIntPipe) userId: number) {
    return this.researchService.getCompanyProfileCacheDebug(userId);
  }

  @Delete('cache/company-profile/:userId')
  invalidateCompanyProfileCache(@Param('userId', ParseIntPipe) userId: number) {
    return this.researchService.invalidateCompanyProfileCache(userId);
  }

  @Get('pipelines/:pipelineRunId/progress')
  getPipelineProgress(@Param('pipelineRunId') pipelineRunId: string) {
    return this.researchService.getPipelineProgress(pipelineRunId);
  }

  @Get('users/:userId/pipelines')
  getUserPipelineHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('status') status?: string,
    @Query('mode') mode?: string,
  ) {
    return this.researchService.getUserPipelineHistory({
      userId,
      page,
      pageSize,
      status,
      mode,
    });
  }
}
