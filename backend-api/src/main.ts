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

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  
  // Global exception filter to sanitize error messages
  app.useGlobalFilters(new AllExceptionsFilter());
  
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
  // Security hardening
  app.use(helmet());
  // CORS for frontend origin; default to localhost:3000
  const appOrigin = process.env.APP_ORIGIN || 'http://localhost:3000';
  app.enableCors({
    origin: appOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
}

bootstrap();
