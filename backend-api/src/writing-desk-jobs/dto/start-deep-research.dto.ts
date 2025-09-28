import { IsOptional, IsString } from 'class-validator';

export class StartDeepResearchDto {
  @IsString()
  @IsOptional()
  jobId?: string;
}
