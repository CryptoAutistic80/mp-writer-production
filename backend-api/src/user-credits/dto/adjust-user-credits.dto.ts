import { IsInt, Min } from 'class-validator';

export class AdjustUserCreditsDto {
  @IsInt()
  @Min(1)
  amount!: number;
}

