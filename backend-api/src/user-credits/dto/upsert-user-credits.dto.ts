import { IsInt, Min } from 'class-validator';

export class UpsertUserCreditsDto {
  @IsInt()
  @Min(0)
  credits!: number;
}

