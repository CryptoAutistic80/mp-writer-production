import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  WRITING_DESK_JOB_PHASES,
  WRITING_DESK_RESEARCH_STATUSES,
  WritingDeskJobPhase,
  WritingDeskResearchStatus,
} from '../writing-desk-jobs.types';

class WritingDeskJobFormDto {
  @IsString()
  issueDetail!: string;

  @IsString()
  affectedDetail!: string;

  @IsString()
  backgroundDetail!: string;

  @IsString()
  desiredOutcome!: string;
}

export class UpsertActiveWritingDeskJobDto {
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsEnum(WRITING_DESK_JOB_PHASES)
  phase!: WritingDeskJobPhase;

  @Type(() => WritingDeskJobFormDto)
  @ValidateNested()
  form!: WritingDeskJobFormDto;

  @IsInt()
  @Min(0)
  stepIndex!: number;

  @IsInt()
  @Min(0)
  followUpIndex!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  followUpQuestions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  followUpAnswers?: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  responseId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  notes?: string;

  @IsOptional()
  @IsString()
  researchContent?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  researchResponseId?: string;

  @IsOptional()
  @IsEnum(WRITING_DESK_RESEARCH_STATUSES)
  researchStatus?: WritingDeskResearchStatus;
}
