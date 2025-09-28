import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class WritingDeskIntakeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  issueDescription!: string;
}

