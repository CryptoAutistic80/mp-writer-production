import { MessageEvent } from '@nestjs/common';

import { AiTranscriptionService, StreamTimeoutError } from './transcription.service';
import { TranscriptionModel } from '../dto/transcription.dto';
import { ConfigService } from '@nestjs/config';
import { UserCreditsService } from '../../user-credits/user-credits.service';
import { OpenAiClientService } from '../openai/openai-client.service';

jest.mock('../openai/openai.helpers', () => ({
  isOpenAiRelatedError: jest.fn().mockReturnValue(false),
}));

describe('AiTranscriptionService', () => {
  let service: AiTranscriptionService;
  let config: jest.Mocked<ConfigService>;
  let userCredits: jest.Mocked<UserCreditsService>;
  let openAiClient: jest.Mocked<OpenAiClientService>;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') {
          return 'test-key';
        }
        if (key === 'OPENAI_TRANSCRIPTION_MODEL') {
          return undefined;
        }
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    userCredits = {
      deductFromMine: jest.fn().mockResolvedValue({ credits: 10 }),
      addToMine: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserCreditsService>;

    openAiClient = {
      getClient: jest.fn(),
      recordSuccess: jest.fn(),
      markError: jest.fn(),
    } as unknown as jest.Mocked<OpenAiClientService>;

    service = new AiTranscriptionService(config, userCredits, openAiClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('streamTranscription', () => {
    it('retries when inactivity timeout occurs before reporting failure', async () => {
      const createMock = jest.fn()
        .mockResolvedValueOnce({} as AsyncIterable<unknown>)
        .mockResolvedValueOnce({} as AsyncIterable<unknown>);

      openAiClient.getClient.mockResolvedValue({
        audio: { transcriptions: { create: createMock } },
      } as any);

      let inactivityWarnings = 0;
      const createStreamSpy = jest
        .spyOn(service as any, 'createStreamWithTimeout')
        .mockImplementationOnce((_: AsyncIterable<unknown>, __: number, onTimeout: () => void) => {
          inactivityWarnings += 1;
          onTimeout();
          return (async function* () {
            throw new StreamTimeoutError('Simulated inactivity timeout');
          })();
        })
        .mockImplementationOnce(() => {
          return (async function* () {
            throw new Error('permanent failure');
          })();
        });

      const events: MessageEvent[] = [];

      await new Promise<void>((resolve) => {
        service
          .streamTranscription('user-1', {
            audioData: Buffer.from('audio').toString('base64'),
            model: TranscriptionModel.GPT_4O_MINI_TRANSCRIBE,
          } as any)
          .subscribe({
            next: (event) => {
              events.push(event);
            },
            complete: () => {
              resolve();
            },
          });
      });

      expect(createMock).toHaveBeenCalledTimes(2);
      expect(createStreamSpy).toHaveBeenCalledTimes(2);
      expect(inactivityWarnings).toBe(1);

      expect(userCredits.addToMine).toHaveBeenCalledTimes(1);

      expect(events).toHaveLength(1);
      const payload = JSON.parse(events[0].data as string);
      expect(payload).toEqual({ type: 'error', message: 'permanent failure' });
    });
  });
});
