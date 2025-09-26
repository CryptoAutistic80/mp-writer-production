import { IsNumber, Min } from 'class-validator';

export class AdjustUserCreditsDto {
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.1)
  amount!: number;
}
