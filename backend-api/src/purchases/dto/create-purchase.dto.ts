import { IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  plan!: string;

  @IsInt()
  @IsPositive()
  amount!: number;

  @IsString()
  @IsOptional()
  currency?: string = 'usd';

  @IsOptional()
  metadata?: Record<string, any>;
}

