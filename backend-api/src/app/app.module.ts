import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TerminusModule } from '@nestjs/terminus';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { NestModulesModule } from '@mp-writer/nest-modules';
import { HealthController } from './health.controller';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { AiModule } from '../ai/ai.module';
import { MpsModule } from '../mps/mps.module';
import { UserMpModule } from '../user-mp/user-mp.module';
import { AddressesModule } from '../user-address/addresses.module';
import { UserAddressModule } from '../user-address-store/user-address.module';
import { UserCreditsModule } from '../user-credits/user-credits.module';
import { CryptoModule } from '../crypto/crypto.module';
import { EncryptionService } from '../crypto/encryption.service';
import { WritingDeskJobsModule } from '../writing-desk-jobs/writing-desk-jobs.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { UserSavedLettersModule } from '../user-saved-letters/user-saved-letters.module';

function validateConfig(config: Record<string, unknown>) {
  const errors: string[] = [];

  const requireString = (key: string, opts?: { minLength?: number; forbid?: string[] }) => {
    const raw = config[key];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      errors.push(`${key} is required`);
      return;
    }
    if (opts?.minLength && raw.length < opts.minLength) {
      errors.push(`${key} must be at least ${opts.minLength} characters`);
    }
    if (opts?.forbid?.some((value) => value === raw)) {
      errors.push(`${key} must not use the default value '${raw}'`);
    }
  };

  // Core required variables
  requireString('MONGO_URI');
  requireString('JWT_SECRET', { minLength: 32, forbid: ['changeme'] });

  const dek = config.DATA_ENCRYPTION_KEY;
  if (typeof dek !== 'string' || dek.trim().length === 0) {
    errors.push('DATA_ENCRYPTION_KEY is required');
  } else {
    try {
      EncryptionService.deriveKey(dek);
    } catch (e: unknown) {
      errors.push(`DATA_ENCRYPTION_KEY invalid: ${(e as Error).message}`);
    }
  }

  // OpenAI API key is required for AI operations
  requireString('OPENAI_API_KEY', { minLength: 20 });

  // Validate APP_ORIGIN format if provided
  const appOrigin = config.APP_ORIGIN;
  if (appOrigin && typeof appOrigin === 'string') {
    if (!/^https?:\/\//i.test(appOrigin)) {
      errors.push('APP_ORIGIN must be an absolute http(s) URL');
    }
  }

  // Stripe validation - required if checkout is enabled
  const stripeEnabled = config.STRIPE_CHECKOUT_ENABLED === '1' || config.STRIPE_CHECKOUT_ENABLED === 'true';
  if (stripeEnabled) {
    requireString('STRIPE_SECRET_KEY', { minLength: 20 });
    requireString('STRIPE_WEBHOOK_SECRET', { minLength: 20 });
    requireString('STRIPE_PRICE_ID_CREDITS_3');
    requireString('STRIPE_PRICE_ID_CREDITS_5');
    requireString('STRIPE_PRICE_ID_CREDITS_10');
    
    // Validate that stripe keys look correct
    const stripeKey = config.STRIPE_SECRET_KEY;
    if (typeof stripeKey === 'string' && !stripeKey.startsWith('sk_')) {
      errors.push('STRIPE_SECRET_KEY must start with sk_');
    }
    const webhookSecret = config.STRIPE_WEBHOOK_SECRET;
    if (typeof webhookSecret === 'string' && !webhookSecret.startsWith('whsec_')) {
      errors.push('STRIPE_WEBHOOK_SECRET must start with whsec_');
    }
  }

  // Google OAuth validation - if any Google OAuth key is provided, all must be provided
  const hasGoogleClientId = typeof config.GOOGLE_CLIENT_ID === 'string' && config.GOOGLE_CLIENT_ID.trim().length > 0;
  const hasGoogleClientSecret = typeof config.GOOGLE_CLIENT_SECRET === 'string' && config.GOOGLE_CLIENT_SECRET.trim().length > 0;
  const hasGoogleCallback = typeof config.GOOGLE_CALLBACK_URL === 'string' && config.GOOGLE_CALLBACK_URL.trim().length > 0;
  
  if (hasGoogleClientId || hasGoogleClientSecret || hasGoogleCallback) {
    // If any Google OAuth config is provided, all must be provided
    if (!hasGoogleClientId) errors.push('GOOGLE_CLIENT_ID is required when Google OAuth is configured');
    if (!hasGoogleClientSecret) errors.push('GOOGLE_CLIENT_SECRET is required when Google OAuth is configured');
    if (!hasGoogleCallback) errors.push('GOOGLE_CALLBACK_URL is required when Google OAuth is configured');
  }

  if (errors.length) {
    throw new Error(`Environment validation failed:\n- ${errors.join('\n- ')}`);
  }

  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
    }),
    TerminusModule,
    ThrottlerModule.forRoot([{ ttl: 60, limit: 60 }]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGO_URI'),
      }),
    }),
    NestModulesModule,
    CryptoModule,
    UsersModule,
    AuthModule,
    PurchasesModule,
    CheckoutModule,
    AiModule,
    MpsModule,
    UserMpModule,
    AddressesModule,
    UserAddressModule,
    UserCreditsModule,
    WritingDeskJobsModule,
    UserSavedLettersModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
