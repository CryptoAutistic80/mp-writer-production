import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class WritingDeskFollowUpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  issueDescription!: string;

  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  followUpQuestions!: string[];

  @IsArray()
  @ArrayMaxSize(5)
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
