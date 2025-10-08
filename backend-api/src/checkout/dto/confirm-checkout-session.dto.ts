import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmCheckoutSessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}

