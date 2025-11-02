import { BadRequestException, Injectable, Logger, MessageEvent } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

import {
  StreamingTranscriptionDto,
  TranscriptionDto,
  TranscriptionModel,
  TranscriptionResponseFormat,
} from '../../dto/transcription.dto';
import { UserCreditsService } from '../../../user-credits/user-credits.service';
import { OpenAiClientService } from '../../openai/openai-client.service';
import { isOpenAiRelatedError } from '../../openai/openai.helpers';

@Injectable()
export class AiTranscriptionService {
  private static readonly TRANSCRIPTION_CREDIT_COST = 0;
  private static readonly TRANSCRIPTION_STREAM_INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

  private readonly logger = new Logger(AiTranscriptionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly openAiClient: OpenAiClientService,
  ) {}

  async transcribeAudio(userId: string, input: TranscriptionDto) {
    if (!userId) {
      throw new BadRequestException('User account required');
    }

    const { credits: remainingAfterCharge } = await this.userCredits.deductFromMine(
      userId,
      AiTranscriptionService.TRANSCRIPTION_CREDIT_COST,
    );
    const apiKey = this.config.get<string>('OPENAI_API_KEY');

    try {
      if (!apiKey) {
        const stubText =
          'DEV-STUB: This is a placeholder transcription. Please configure OPENAI_API_KEY for real transcription.';
        this.logger.log(`[transcription] DEV-STUB ${JSON.stringify({ model: 'dev-stub', text: stubText })}`);
        return {
          model: 'dev-stub',
          text: stubText,
          remainingCredits: remainingAfterCharge,
        };
      }

      const client = await this.openAiClient.getClient(apiKey);
      const model = this.resolveTranscriptionModel(input.model);
      const responseFormat = input.responseFormat ?? TranscriptionResponseFormat.TEXT;

      const audioBuffer = Buffer.from(input.audioData, 'base64');
      const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model,
        response_format: responseFormat,
        prompt: input.prompt || 'Use British English spelling throughout.',
        language: input.language || 'en',
      });

      this.logger.log(`[transcription] Raw response: ${JSON.stringify(transcription)}`);

      this.openAiClient.recordSuccess();

      const bundle = {
        model,
        text: transcription.text || transcription || 'No transcription text received',
        remainingCredits: remainingAfterCharge,
      };

      this.logger.log(`[transcription] Processed bundle: ${JSON.stringify(bundle)}`);

      return bundle;
    } catch (error) {
      if (isOpenAiRelatedError(error)) {
        this.openAiClient.markError('transcribeAudio', error);
      }
      await this.refundCredits(userId, AiTranscriptionService.TRANSCRIPTION_CREDIT_COST);
      throw error;
    }
  }

  streamTranscription(userId: string, input: StreamingTranscriptionDto): Observable<MessageEvent> {
    if (!userId) {
      throw new BadRequestException('User account required');
    }

    return new Observable<MessageEvent>((subscriber) => {
      let settled = false;

      const transcribe = async () => {
        try {
          const { credits: remainingAfterCharge } = await this.userCredits.deductFromMine(
            userId,
            AiTranscriptionService.TRANSCRIPTION_CREDIT_COST,
          );
          const apiKey = this.config.get<string>('OPENAI_API_KEY');

          if (!apiKey) {
            const stubText =
              'DEV-STUB: This is a placeholder streaming transcription. Please configure OPENAI_API_KEY for real transcription.';
            subscriber.next({ data: JSON.stringify({ type: 'delta', text: stubText }) });
            subscriber.next({
              data: JSON.stringify({ type: 'complete', text: stubText, remainingCredits: remainingAfterCharge }),
            });
            subscriber.complete();
            return;
          }

          const client = await this.openAiClient.getClient(apiKey);
          const model = this.resolveTranscriptionModel(input.model);

          const audioBuffer = Buffer.from(input.audioData, 'base64');
          const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

          const stream = await client.audio.transcriptions.create({
            file: audioFile,
            model,
            response_format: TranscriptionResponseFormat.TEXT,
            stream: true,
            prompt: input.prompt || 'Use British English spelling throughout.',
            language: input.language || 'en',
          });

          const timeoutWrappedStream = this.createStreamWithTimeout(
            stream,
            AiTranscriptionService.TRANSCRIPTION_STREAM_INACTIVITY_TIMEOUT_MS,
            () => this.logger.warn(`[transcription] Stream inactivity timeout for user ${userId}`),
          );

          for await (const event of timeoutWrappedStream) {
            if (subscriber.closed) {
              break;
            }

            const typedEvent = event as any;
            if (typedEvent.type === 'transcript.text.delta') {
              subscriber.next({ data: JSON.stringify({ type: 'delta', text: typedEvent.delta }) });
            } else if (typedEvent.type === 'transcript.text.done') {
              this.openAiClient.recordSuccess();
              subscriber.next({
                data: JSON.stringify({
                  type: 'complete',
                  text: typedEvent.text,
                  remainingCredits: remainingAfterCharge,
                }),
              });
              subscriber.complete();
              settled = true;
              return;
            }
          }

          if (!settled) {
            subscriber.next({
              data: JSON.stringify({ type: 'error', message: 'Transcription stream ended unexpectedly' }),
            });
            subscriber.complete();
          }
        } catch (error) {
          if (isOpenAiRelatedError(error)) {
            this.openAiClient.markError('streamTranscription', error);
          }
          if (!subscriber.closed) {
            await this.refundCredits(userId, AiTranscriptionService.TRANSCRIPTION_CREDIT_COST);
            let errorMessage = 'Transcription failed';
            if (error instanceof Error) {
              const message = error.message;
              if (message.includes('timeout') || message.includes('inactivity')) {
                errorMessage = 'Transcription timed out due to inactivity. Please try again.';
              } else {
                errorMessage = message;
              }
            }
            subscriber.next({ data: JSON.stringify({ type: 'error', message: errorMessage }) });
            subscriber.complete();
          }
        }
      };

      void transcribe();

      return () => {
        settled = true;
      };
    });
  }

  private resolveTranscriptionModel(modelFromRequest?: TranscriptionModel): TranscriptionModel {
    if (modelFromRequest && Object.values(TranscriptionModel).includes(modelFromRequest)) {
      return modelFromRequest;
    }

    const configuredModel = this.config.get<string>('OPENAI_TRANSCRIPTION_MODEL')?.trim();
    const allowedModels = Object.values(TranscriptionModel) as string[];

    if (configuredModel && allowedModels.includes(configuredModel)) {
      return configuredModel as TranscriptionModel;
    }

    if (configuredModel && !allowedModels.includes(configuredModel)) {
      this.logger.warn(
        `Unsupported OPENAI_TRANSCRIPTION_MODEL "${configuredModel}" provided. Falling back to "${TranscriptionModel.GPT_4O_MINI_TRANSCRIBE}".`,
      );
    }

    return TranscriptionModel.GPT_4O_MINI_TRANSCRIBE;
  }

  private async refundCredits(userId: string, amount: number) {
    try {
      await this.userCredits.addToMine(userId, amount);
    } catch (error) {
      this.logger.warn(`Failed to refund credits for user ${userId}: ${(error as Error).message}`);
    }
  }

  private async* createStreamWithTimeout<T>(
    stream: AsyncIterable<T>,
    timeoutMs: number,
    onTimeout: () => void,
  ): AsyncGenerator<T, void, unknown> {
    let lastEventTime = Date.now();
    let timeoutTriggered = false;
    let timedOut = false;

    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastEventTime;
      if (elapsed >= timeoutMs && !timeoutTriggered) {
        timeoutTriggered = true;
        timedOut = true;
        clearInterval(checkInterval);
        onTimeout();
      }
    }, Math.min(1000, timeoutMs));

    const iterator = stream[Symbol.asyncIterator]();

    try {
      while (true) {
        if (timedOut) {
          return;
        }

        const result = await iterator.next();
        if (result.done) {
          return;
        }

        lastEventTime = Date.now();
        timeoutTriggered = false;
        yield result.value;
      }
    } finally {
      clearInterval(checkInterval);
      if (iterator.return) {
        await iterator.return(undefined as unknown as T);
      }
    }
  }
}

