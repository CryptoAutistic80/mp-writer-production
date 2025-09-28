import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class StartDeepResearchDto {
  @IsString()
  @IsOptional()
  jobId?: string;

  @IsBoolean()
  @IsOptional()
  resume?: boolean;
}
