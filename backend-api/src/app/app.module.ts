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
import { StreamingStateModule } from '../streaming-state/streaming-state.module';
import { AuditModule } from '../common/audit/audit.module';
import { CsrfModule } from '../common/csrf/csrf.module';

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
  requireString('REDIS_URL');
  requireString('JWT_SECRET', { minLength: 32, forbid: ['changeme'] });

  const dekPrimary = typeof config.DATA_ENCRYPTION_KEY_PRIMARY === 'string' ? config.DATA_ENCRYPTION_KEY_PRIMARY.trim() : '';
  const dekKeyring = typeof config.DATA_ENCRYPTION_KEYS === 'string' ? config.DATA_ENCRYPTION_KEYS.trim() : '';
  const dekMaster = typeof config.DATA_ENCRYPTION_KEY_MASTER === 'string' ? config.DATA_ENCRYPTION_KEY_MASTER.trim() : '';
  const dekVersions = typeof config.DATA_ENCRYPTION_KEY_VERSIONS === 'string' ? config.DATA_ENCRYPTION_KEY_VERSIONS.trim() : '';
  const legacyDek = typeof config.DATA_ENCRYPTION_KEY === 'string' ? config.DATA_ENCRYPTION_KEY.trim() : '';

  const usingExplicitKeyring = dekPrimary.length > 0 && dekKeyring.length > 0;
  const usingDerivedKeyring = dekPrimary.length > 0 && dekMaster.length > 0 && dekVersions.length > 0;
  if (!dekPrimary && (dekKeyring || dekMaster || dekVersions)) {
    errors.push('DATA_ENCRYPTION_KEY_PRIMARY is required when configuring a keyring');
  }

  if (usingExplicitKeyring && usingDerivedKeyring) {
    errors.push('Use either DATA_ENCRYPTION_KEYS or DATA_ENCRYPTION_KEY_VERSIONS with DATA_ENCRYPTION_KEY_MASTER, not both');
  }

  if (usingExplicitKeyring) {
    const seen = new Set<string>();
    const entries = dekKeyring
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (entries.length === 0) {
      errors.push('DATA_ENCRYPTION_KEYS must include at least one <version>:<key> entry');
    }

    for (const entry of entries) {
      const [versionRaw, keyRaw] = entry.split(':');
      const version = versionRaw?.trim();
      const key = keyRaw?.trim();
      if (!version || !key) {
        errors.push(`DATA_ENCRYPTION_KEYS entry '${entry}' must be formatted as <version>:<key>`);
        continue;
      }
      if (seen.has(version)) {
        errors.push(`DATA_ENCRYPTION_KEYS contains duplicate version '${version}'`);
        continue;
      }
      seen.add(version);
      try {
        EncryptionService.deriveKey(key);
      } catch (e: unknown) {
        errors.push(`DATA_ENCRYPTION_KEYS entry '${version}' invalid: ${(e as Error).message}`);
      }
    }

    if (!seen.has(dekPrimary)) {
      errors.push(`DATA_ENCRYPTION_KEYS must include the primary version '${dekPrimary}'`);
    }
  } else if (usingDerivedKeyring) {
    try {
      EncryptionService.deriveKey(dekMaster);
    } catch (e: unknown) {
      errors.push(`DATA_ENCRYPTION_KEY_MASTER invalid: ${(e as Error).message}`);
    }

    const versions = dekVersions
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (versions.length === 0) {
      errors.push('DATA_ENCRYPTION_KEY_VERSIONS must list at least one version when using DATA_ENCRYPTION_KEY_MASTER');
    }

    const seen = new Set<string>();
    for (const version of versions) {
      if (seen.has(version)) {
        errors.push(`DATA_ENCRYPTION_KEY_VERSIONS contains duplicate version '${version}'`);
        continue;
      }
      seen.add(version);
    }

    if (!seen.has(dekPrimary)) {
      errors.push(`DATA_ENCRYPTION_KEY_VERSIONS must include the primary version '${dekPrimary}'`);
    }
  } else if (legacyDek.length > 0 && !usingExplicitKeyring && !usingDerivedKeyring) {
    try {
      EncryptionService.deriveKey(legacyDek);
    } catch (e: unknown) {
      errors.push(`DATA_ENCRYPTION_KEY invalid: ${(e as Error).message}`);
    }
  } else {
    errors.push('Provide either DATA_ENCRYPTION_KEY, DATA_ENCRYPTION_KEYS with DATA_ENCRYPTION_KEY_PRIMARY, or DATA_ENCRYPTION_KEY_MASTER with DATA_ENCRYPTION_KEY_VERSIONS and DATA_ENCRYPTION_KEY_PRIMARY');
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
    ThrottlerModule.forRoot([
      { 
        name: 'default',
        ttl: 60, 
        limit: 60 
      },
      {
        name: 'ai',
        ttl: 300, // 5 minutes
        limit: 5
      },
      {
        name: 'credit',
        ttl: 600, // 10 minutes
        limit: 10
      },
      {
        name: 'webhook',
        ttl: 60, // 1 minute
        limit: 10
      }
    ]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGO_URI'),
        maxPoolSize: 20,        // Allow up to 20 concurrent connections
        minPoolSize: 5,         // Keep 5 connections always open
        maxIdleTimeMS: 30000,   // Close idle connections after 30s
        serverSelectionTimeoutMS: 5000,  // Fail fast if no server available
        socketTimeoutMS: 45000, // 45s socket timeout
        connectTimeoutMS: 10000, // 10s connection timeout
        heartbeatFrequencyMS: 10000, // Check server health every 10s
        retryWrites: true,      // Retry failed writes
        retryReads: true,       // Retry failed reads
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
    StreamingStateModule,
    AuditModule,
    CsrfModule,
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
