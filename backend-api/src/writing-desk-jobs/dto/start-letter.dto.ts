import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { WRITING_DESK_LETTER_TONES, WritingDeskLetterTone } from '../writing-desk-jobs.types';

export class StartLetterDto {
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsEnum(WRITING_DESK_LETTER_TONES)
  tone!: WritingDeskLetterTone;
}
