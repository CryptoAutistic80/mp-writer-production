/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { json, urlencoded, Request, Response, NextFunction } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuditLogService } from './common/audit/audit-log.service';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor';
import { CsrfGuard } from './common/csrf/csrf.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  
  // Enable graceful shutdown hooks
  app.enableShutdownHooks();
  
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const isProduction = process.env.NODE_ENV === 'production';
  const trustProxyEnv = process.env.TRUST_PROXY?.toLowerCase();
  const isCloudRun = Boolean(process.env.K_SERVICE);
  const trustProxyEnabled =
    trustProxyEnv === 'true' ||
    trustProxyEnv === '1' ||
    (!trustProxyEnv && isCloudRun);

  if (trustProxyEnabled) {
    // Honor X-Forwarded-* headers from the upstream proxy (Cloud Run, load balancer, etc.)
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', 1);
  }

  if (isProduction && trustProxyEnabled) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const protoHeader = req.headers['x-forwarded-proto'];
      const proto = Array.isArray(protoHeader)
        ? protoHeader[0]
        : protoHeader?.split(',')[0]?.trim();

      if (proto !== 'https') {
        const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;

        if (!hostHeader) {
          return res.status(400).send('HTTPS required');
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
          const redirectUrl = `https://${hostHeader}${req.originalUrl}`;
          return res.redirect(301, redirectUrl);
        }

        return res.status(400).send('HTTPS required');
      }

      return next();
    });
  } else if (isProduction && !trustProxyEnabled) {
    Logger.warn(
      'HTTPS enforcement disabled because TRUST_PROXY is not enabled. Set TRUST_PROXY=1 (or deploy behind Cloud Run) to enforce HTTPS.'
    );
  }
  
  // Get AuditLogService instance for AllExceptionsFilter
  const auditService = app.get(AuditLogService);
  
  // Global exception filter to sanitize error messages and log security events
  app.useGlobalFilters(new AllExceptionsFilter(auditService));
  
  // Register RequestContextInterceptor globally to track user context for audit logs
  app.useGlobalInterceptors(new RequestContextInterceptor(auditService));
  app.useGlobalGuards(app.get(CsrfGuard));
  
  // Stripe webhook requires raw body, but other routes need parsed JSON
  // We'll apply JSON parsing conditionally
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl === '/api/checkout/webhook') {
      // Skip JSON parsing for webhook - raw body is already available via rawBody: true
      next();
    } else {
      json({ limit: '1mb' })(req, res, next);
    }
  });
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Coerce primitive types (e.g., "5.00" -> 5) for DTOs
      transformOptions: { enableImplicitConversion: true },
    })
  );
  
  // Security headers via Helmet
  // Note: CSP is disabled here because:
  // 1. This is an API server (no HTML served)
  // 2. Frontend handles its own CSP in next.config.js
  // 3. API responses are JSON, not rendered in browser context
  app.use(helmet({
    // Disable CSP for API server - frontend handles this
    contentSecurityPolicy: false,
    
    // Enable HSTS (only works over HTTPS) - production only
    hsts: isProduction ? {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    } : false,
    
    // X-Frame-Options: DENY (prevents clickjacking)
    frameguard: {
      action: 'deny',
    },
    
    // X-Content-Type-Options: nosniff (prevents MIME sniffing)
    noSniff: true,
    
    // Referrer-Policy for privacy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
    
    // X-DNS-Prefetch-Control (disable DNS prefetching)
    dnsPrefetchControl: {
      allow: false,
    },
    
    // X-Download-Options: noopen (IE8+ security)
    ieNoOpen: true,
    
    // Remove X-Powered-By header (security through obscurity)
    hidePoweredBy: true,
  }));
  
  // CORS for frontend origin; default to localhost:3000
  // Support comma-separated origins for multiple environments (e.g., staging + production)
  const originsEnv = process.env.APP_ORIGIN || 'http://localhost:3000';
  const origins = originsEnv.split(',').map(o => o.trim());
  
  // Validate origins - fail-fast on misconfiguration
  origins.forEach(origin => {
    // Block wildcard origins for security
    if (origin === '*' || origin.includes('*')) {
      throw new Error('CORS origin cannot contain wildcard "*". Specify explicit origins separated by commas.');
    }
    
    // Validate URL format and protocol
    try {
      const originUrl = new URL(origin);
      // Only allow http or https protocols
      if (!['http:', 'https:'].includes(originUrl.protocol)) {
        throw new Error(`CORS origin must use http or https protocol, got: ${originUrl.protocol}`);
      }
    } catch (_err) {
      throw new Error(`Invalid CORS origin: ${origin}. Must be a valid URL (e.g., https://example.com)`);
    }
  });
  
  // Configure CORS
  const corsConfig = {
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Removed PATCH - not used in codebase
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
  
  app.enableCors(corsConfig);
  
  // Log CORS configuration for visibility
  Logger.log(`🔒 CORS enabled for ${origins.length === 1 ? 'origin' : 'origins'}: ${origins.join(', ')}`);
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  Logger.log(
    `🚀 Application is running on: http://${host}:${port}/${globalPrefix}`
  );

  // Setup graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    Logger.log(`Received ${signal}, starting graceful shutdown...`);
    
    const shutdownTimeout = setTimeout(() => {
      Logger.error('Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 30000); // 30 second timeout

    try {
      await app.close();
      clearTimeout(shutdownTimeout);
      Logger.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      clearTimeout(shutdownTimeout);
      Logger.error(`Error during graceful shutdown: ${(error as Error)?.message ?? error}`);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap();
