import { Logger } from '@nestjs/common';

export interface OpenAiClientState {
  client: any | null;
  createdAt: number | null;
  errorCount: number;
}

interface ClientLifecycleParams {
  apiKey: string;
  logger: Logger;
  maxAgeMs: number;
  maxErrors: number;
}

export async function createOrGetOpenAiClient(
  state: OpenAiClientState,
  params: ClientLifecycleParams,
) {
  const now = Date.now();
  const needsRecreation =
    !state.client ||
    (state.createdAt && now - state.createdAt > params.maxAgeMs) ||
    state.errorCount >= params.maxErrors;

  if (needsRecreation) {
    if (state.client) {
      const reason = !state.createdAt
        ? 'no timestamp'
        : now - state.createdAt > params.maxAgeMs
        ? 'age limit (30 minutes)'
        : `error count (${state.errorCount})`;
      params.logger.log(`Recreating OpenAI client due to: ${reason}`);
    }

    const { default: OpenAI } = await import('openai');
    state.client = new OpenAI({
      apiKey: params.apiKey,
      timeout: 60000, // 60 seconds - accommodates streaming operations
      maxRetries: 3,
    });
    state.createdAt = now;
    state.errorCount = 0;
  }

  return state.client;
}

interface ErrorHandlingParams {
  error: any;
  context: string;
  logger: Logger;
  maxErrors: number;
}

export function handleOpenAiError(
  state: OpenAiClientState,
  params: ErrorHandlingParams,
): never {
  state.errorCount++;
  const errorMessage = params.error?.message || 'unknown error';
  params.logger.error(
    `OpenAI error in ${params.context}: ${errorMessage} (error count: ${state.errorCount})`,
  );

  if (state.errorCount >= params.maxErrors) {
    params.logger.warn(
      `OpenAI client will be recreated on next call due to ${state.errorCount} consecutive errors`,
    );
  }

  throw params.error;
}

export function handleOpenAiSuccess(state: OpenAiClientState, logger: Logger) {
  if (state.errorCount > 0) {
    logger.log(`OpenAI client recovered after ${state.errorCount} previous errors`);
    state.errorCount = 0;
  }
}
