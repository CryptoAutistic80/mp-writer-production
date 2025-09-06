import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt!: string;

  @IsString()
  @IsOptional()
  model?: string;
}

