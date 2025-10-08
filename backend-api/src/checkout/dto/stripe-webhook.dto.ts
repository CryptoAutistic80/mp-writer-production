import { IsString, IsNotEmpty } from 'class-validator';

export class StripeWebhookDto {
  @IsString()
  @IsNotEmpty()
  signature!: string;

  @IsString()
  @IsNotEmpty()
  payload!: string;
}

