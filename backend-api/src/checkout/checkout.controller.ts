import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { ConfirmCheckoutSessionDto } from './dto/confirm-checkout-session.dto';

@UseGuards(JwtAuthGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('session')
  createSession(@Req() req: any, @Body() body: CreateCheckoutSessionDto) {
    return this.checkout.createSession(req.user, body.credits);
  }

  @Post('confirm')
  confirm(@Req() req: any, @Body() body: ConfirmCheckoutSessionDto) {
    return this.checkout.confirmSession(req.user, body.sessionId);
  }
}

