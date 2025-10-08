import { IsInt, IsPositive } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsInt()
  @IsPositive()
  credits!: number;
}

