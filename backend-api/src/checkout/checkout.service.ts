import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { UserCreditsService } from '../user-credits/user-credits.service';
import { PurchasesService } from '../purchases/purchases.service';

type CheckoutUser = { id: string; email?: string | null };

@Injectable()
export class CheckoutService {
  private readonly stripe: Stripe | null;
  private readonly checkoutEnabled: boolean;
  private readonly priceMap: Record<number, string>;
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly purchases: PurchasesService,
  ) {
    this.checkoutEnabled = this.parseBoolean(this.config.get('STRIPE_CHECKOUT_ENABLED'));
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = secretKey ? new Stripe(secretKey) : null;
    this.priceMap = this.loadPriceMap();
  }

  async createSession(user: CheckoutUser, credits: number) {
    this.assertCheckoutEnabled();
    const stripe = this.requireStripe();
    const priceId = this.resolvePriceId(credits);
    const origin = this.getAppOrigin();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/credit-shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/credit-shop/cancel`,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: {
        userId: user.id,
        credits: String(credits),
        priceId,
        fulfilled: 'false',
      },
    });

    if (!session.url) {
      throw new InternalServerErrorException('Unable to create Stripe checkout session.');
    }

    return { sessionId: session.id, url: session.url };
  }

  async confirmSession(user: CheckoutUser, sessionId: string) {
    this.assertCheckoutEnabled();
    const stripe = this.requireStripe();
    if (!sessionId) throw new BadRequestException('sessionId is required');

    const existing = await this.purchases.findByStripeSession(user.id, sessionId);
    if (existing) {
      const balance = await this.userCredits.getMine(user.id);
      return { alreadyProcessed: true, creditsAdded: 0, balance: balance.credits };
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'line_items.data.price'],
    });

    if (session.client_reference_id && session.client_reference_id !== user.id) {
      throw new ForbiddenException('Checkout session does not belong to this user.');
    }

    if (session.metadata?.userId && session.metadata.userId !== user.id) {
      throw new ForbiddenException('Checkout session metadata mismatch.');
    }

    if (session.metadata?.fulfilled === 'true') {
      const balance = await this.userCredits.getMine(user.id);
      return { alreadyProcessed: true, creditsAdded: 0, balance: balance.credits };
    }

    const credits = Number(session.metadata?.credits ?? 0);
    if (!Number.isFinite(credits) || credits <= 0) {
      throw new BadRequestException('Checkout session is missing credit information.');
    }

    const expectedPriceId = this.resolvePriceId(credits);
    const priceFromMetadata = session.metadata?.priceId;
    const priceFromLineItem = session.line_items?.data?.[0]?.price?.id;
    const resolvedPriceId = priceFromMetadata || priceFromLineItem;
    if (!resolvedPriceId) {
      throw new BadRequestException('Unable to determine price for checkout session.');
    }
    if (resolvedPriceId !== expectedPriceId) {
      throw new BadRequestException('Checkout session price does not match the selected package.');
    }

    if (session.payment_status !== 'paid') {
      throw new BadRequestException('Checkout session has not completed payment.');
    }

    const defaultCurrency = (this.config.get<string>('STRIPE_CURRENCY') || 'gbp').toLowerCase();
    const amountMinor = typeof session.amount_total === 'number' ? session.amount_total : session.line_items?.data?.[0]?.amount_total ?? 0;

    const balance = await this.userCredits.addToMine(user.id, credits);
    try {
      await this.purchases.create(user.id, {
        plan: `credit_pack_${credits}`,
        amount: amountMinor,
        currency: session.currency ?? defaultCurrency,
        metadata: {
          stripeSessionId: session.id,
          stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
          credits,
          priceId: resolvedPriceId,
        },
      });
    } catch (error) {
      this.logger.error(`Unable to record purchase for session ${session.id}: ${(error as Error).message}`);
    }
    try {
      await stripe.checkout.sessions.update(session.id, {
        metadata: {
          userId: user.id,
          credits: String(credits),
          priceId: resolvedPriceId,
          fulfilled: 'true',
        },
      });
    } catch (error) {
      this.logger.warn(`Unable to mark checkout session ${session.id} as fulfilled: ${(error as Error).message}`);
    }

    return { alreadyProcessed: false, creditsAdded: credits, balance: balance.credits };
  }

  private assertCheckoutEnabled() {
    if (!this.checkoutEnabled) {
      throw new BadRequestException('Stripe checkout is disabled.');
    }
  }

  private requireStripe() {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe is not configured.');
    }
    return this.stripe;
  }

  private resolvePriceId(credits: number) {
    const priceId = this.priceMap[credits];
    if (!priceId) {
      throw new BadRequestException('Unsupported credit package.');
    }
    return priceId;
  }

  private parseBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return !['0', 'false', 'no', ''].includes(value.trim().toLowerCase());
    return false;
  }

  private loadPriceMap() {
    const entries: Array<[number, string | undefined]> = [
      [3, this.config.get<string>('STRIPE_PRICE_ID_CREDITS_3')],
      [5, this.config.get<string>('STRIPE_PRICE_ID_CREDITS_5')],
      [10, this.config.get<string>('STRIPE_PRICE_ID_CREDITS_10')],
    ];

    const map: Record<number, string> = {};
    for (const [credits, priceId] of entries) {
      if (priceId) {
        map[credits] = priceId;
      }
    }
    return map;
  }

  private getAppOrigin() {
    const origin = this.config.get<string>('APP_ORIGIN');
    if (!origin) {
      throw new InternalServerErrorException('APP_ORIGIN is not configured.');
    }
    return origin.replace(/\/+$/, '');
  }
}
