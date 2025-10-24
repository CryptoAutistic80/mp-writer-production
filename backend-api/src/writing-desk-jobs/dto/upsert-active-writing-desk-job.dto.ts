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
  WRITING_DESK_LETTER_STATUSES,
  WRITING_DESK_LETTER_TONES,
  WRITING_DESK_RESEARCH_STATUSES,
  WritingDeskJobPhase,
  WritingDeskLetterStatus,
  WritingDeskLetterTone,
  WritingDeskResearchStatus,
} from '../writing-desk-jobs.types';
import { MaxUserInput, MaxAiContent, MaxResearchContent, MaxJsonContent } from '../../common/decorators/content-validation.decorators';

class WritingDeskJobFormDto {
  @IsString()
  @MaxUserInput()
  issueDescription!: string;
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
  @MaxUserInput()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxResearchContent()
  researchContent?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  researchResponseId?: string;

  @IsOptional()
  @IsEnum(WRITING_DESK_RESEARCH_STATUSES)
  researchStatus?: WritingDeskResearchStatus;

  @IsOptional()
  @IsEnum(WRITING_DESK_LETTER_STATUSES)
  letterStatus?: WritingDeskLetterStatus;

  @IsOptional()
  @IsEnum(WRITING_DESK_LETTER_TONES)
  letterTone?: WritingDeskLetterTone;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  letterResponseId?: string;

  @IsOptional()
  @IsString()
  @MaxAiContent()
  letterContent?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  letterReferences?: string[];

  @IsOptional()
  @IsString()
  @MaxJsonContent()
  letterJson?: string;
}
