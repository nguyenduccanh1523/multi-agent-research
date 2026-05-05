import { Module } from '@nestjs/common';

import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

@Module({
  imports: [OrchestratorModule],
  controllers: [ResearchController],
  providers: [ResearchService],
})
export class ResearchModule {}
