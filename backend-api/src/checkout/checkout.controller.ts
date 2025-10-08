import { Body, Controller, Get, Headers, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { ConfirmCheckoutSessionDto } from './dto/confirm-checkout-session.dto';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @UseGuards(JwtAuthGuard)
  @Post('session')
  createSession(@Req() req: any, @Body() body: CreateCheckoutSessionDto) {
    return this.checkout.createSession(req.user, body.credits);
  }

  @UseGuards(JwtAuthGuard)
  @Post('confirm')
  confirm(@Req() req: any, @Body() body: ConfirmCheckoutSessionDto) {
    return this.checkout.confirmSession(req.user, body.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('packages')
  getPackages() {
    return this.checkout.getCreditPackages();
  }

  /**
   * Stripe webhook endpoint
   * Note: This must NOT use body parsing middleware - we need the raw body
   */
  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new Error('Missing stripe-signature header');
    }

    // Access raw body buffer (set up in main.ts)
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new Error('Raw body not available');
    }

    return this.checkout.handleWebhook(signature, rawBody);
  }
}
