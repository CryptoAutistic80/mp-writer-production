import { IsNumber, IsString, IsOptional, Min, IsObject } from 'class-validator';

export interface PurchaseMetadata {
  stripeSessionId: string;
  stripePaymentIntentId?: string;
  credits: number;
  priceId: string;
}

export class CreatePurchaseDto {
  @IsString()
  plan!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsObject()
  @IsOptional()
  metadata?: PurchaseMetadata;
}
