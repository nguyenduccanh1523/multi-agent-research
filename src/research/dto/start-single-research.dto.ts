import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

import { ResearchLevel } from '../../common/enums/research-level.enum';
import { ResearchTool } from '../../common/enums/research-tool.enum';

export class StartSingleResearchDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  jobtitle?: string;

  @IsString()
  @IsOptional()
  focus_on?: string;

  @IsOptional()
  upload_file?: any;

  @IsEnum(ResearchLevel)
  @IsOptional()
  level?: ResearchLevel;

  @IsArray()
  @IsEnum(ResearchTool, { each: true })
  @IsOptional()
  selected_tools?: ResearchTool[];

  @IsObject()
  @IsOptional()
  context?: Record<string, any>;

  @IsObject()
  @IsOptional()
  companyProfile?: Record<string, any>;
}
