import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class WritingDeskIntakeDto {
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
}

