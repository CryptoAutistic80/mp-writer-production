import { IsNumber, Min } from 'class-validator';

export class UpsertUserCreditsDto {
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  credits!: number;
}
