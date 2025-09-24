import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class WritingDeskFollowUpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  issueDetail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1200)
  affectedDetail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  backgroundDetail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1200)
  desiredOutcome!: string;

  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  followUpQuestions!: string[];

  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  followUpAnswers!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  responseId?: string;
}
