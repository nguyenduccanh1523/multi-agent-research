import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

import { ResearchLevel } from '../../common/enums/research-level.enum';
import { ResearchTool } from '../../common/enums/research-tool.enum';

export class StartSingleResearchDto {
  @Type(() => Number)
  @IsInt()
  user_id!: number;

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

  @IsArray()
  @IsOptional()
  upload_docs?: any[];

  @IsArray()
  @IsOptional()
  upload_docs_ai?: any[];

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
}
