import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import { ResearchTool } from '../../common/enums/research-tool.enum';
import { StartSingleResearchDto } from './start-single-research.dto';

export class StartMultiResearchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StartSingleResearchDto)
  companies!: StartSingleResearchDto[];

  @IsArray()
  @IsEnum(ResearchTool, { each: true })
  @IsOptional()
  selected_tools?: ResearchTool[];
}
