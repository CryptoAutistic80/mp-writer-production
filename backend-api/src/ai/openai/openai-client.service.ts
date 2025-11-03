import { Injectable, Logger } from '@nestjs/common';

type OpenAiClient = any;

@Injectable()
export class OpenAiClientService {
  private static readonly CLIENT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly CLIENT_MAX_ERRORS = 5;

  private readonly logger = new Logger(OpenAiClientService.name);
  private client: OpenAiClient | null = null;
  private createdAt: number | null = null;
  private errorCount = 0;

  async getClient(apiKey: string): Promise<OpenAiClient> {
    const now = Date.now();
    const needsRecreation =
      !this.client ||
      (this.createdAt && now - this.createdAt > OpenAiClientService.CLIENT_MAX_AGE_MS) ||
      this.errorCount >= OpenAiClientService.CLIENT_MAX_ERRORS;

    if (needsRecreation) {
      if (this.client) {
        const reason = !this.createdAt
          ? 'no timestamp'
          : now - this.createdAt > OpenAiClientService.CLIENT_MAX_AGE_MS
            ? 'age limit (30 minutes)'
            : `error count (${this.errorCount})`;
        this.logger.log(`Recreating OpenAI client due to: ${reason}`);
      }

      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({
        apiKey,
        timeout: 60000,
        maxRetries: 3,
      });
      this.createdAt = now;
      this.errorCount = 0;
    }

    return this.client;
  }

  handleError(error: any, context: string): never {
    this.incrementErrorCount(context, error, 'error');
    throw error;
  }

  markError(context: string, error?: unknown): void {
    this.incrementErrorCount(context, error, 'warn');
  }

  recordSuccess(): void {
    if (this.errorCount > 0) {
      this.logger.log(`OpenAI client recovered after ${this.errorCount} previous errors`);
      this.errorCount = 0;
    }
  }

  private incrementErrorCount(context: string, error: unknown, level: 'error' | 'warn'): void {
    this.errorCount++;

    const message = this.buildErrorMessage(error);
    const log = level === 'error' ? this.logger.error.bind(this.logger) : this.logger.warn.bind(this.logger);
    log(`OpenAI error in ${context}: ${message} (error count: ${this.errorCount})`);

    if (this.errorCount >= OpenAiClientService.CLIENT_MAX_ERRORS) {
      this.logger.warn(
        `OpenAI client will be recreated on next call due to ${this.errorCount} consecutive errors`,
      );
    }
  }

  private buildErrorMessage(error: unknown): string {
    if (!error) {
      return 'unknown error';
    }

    if (error instanceof Error) {
      return error.message || error.name;
    }

    if (typeof error === 'object') {
      try {
        return JSON.stringify(error);
      } catch {
        return '[object Object]';
      }
    }

    return String(error);
  }
}

