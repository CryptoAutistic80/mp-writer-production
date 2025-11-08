import { ConfigService } from '@nestjs/config';
import { ReplaySubject } from 'rxjs';

import { WritingDeskLetterService } from './letter.service';

describe('WritingDeskLetterService stream timeout handling', () => {
  const createService = () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') {
          return 'test-key';
        }
        if (key === 'OPENAI_LETTER_MODEL') {
          return 'gpt-5';
        }
        if (key === 'OPENAI_LETTER_VERBOSITY') {
          return 'balanced';
        }
        if (key === 'OPENAI_LETTER_REASONING_EFFORT') {
          return 'medium';
        }
        return null;
      }),
    } as unknown as ConfigService;

    const userCredits = {
      deductFromMine: jest.fn().mockResolvedValue({ credits: 4.8 }),
      addToMine: jest.fn().mockResolvedValue(undefined),
    } as any;

    const streamingRuns = {
      createHeartbeat: jest.fn().mockReturnValue(jest.fn()),
      touchRun: jest.fn().mockResolvedValue(undefined),
      clearRun: jest.fn().mockResolvedValue(undefined),
      registerRun: jest.fn(),
      getRun: jest.fn(),
      updateRun: jest.fn(),
    } as any;

    const openAiClient = {
      getClient: jest.fn(),
      recordSuccess: jest.fn(),
      markError: jest.fn(),
    } as any;

    const service = new WritingDeskLetterService(
      config,
      userCredits,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      streamingRuns,
      openAiClient,
    );

    return {
      service,
      config,
      userCredits,
      streamingRuns,
      openAiClient,
    };
  };

  const createTimeoutStream = (options: { responseId: string; onAbort: () => void }) => {
    let firstYield = true;
    let abortHandler: ((error: Error) => void) | null = null;
    let aborted = false;

    const controller = {
      abort: jest.fn(() => {
        if (aborted) {
          return;
        }
        aborted = true;
        options.onAbort();
        if (abortHandler) {
          const abortError = new Error('Stream aborted');
          abortError.name = 'AbortError';
          abortHandler(abortError);
        }
      }),
    };

    const stream: any = {
      controller,
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (aborted) {
            return Promise.resolve({ value: undefined, done: true });
          }

          if (firstYield) {
            firstYield = false;
            return Promise.resolve({
              value: {
                type: 'response.created',
                response: { id: options.responseId, status: 'in_progress' },
              },
              done: false,
            });
          }

          return new Promise<IteratorResult<any>>((_, reject) => {
            abortHandler = reject;
          });
        },
      }),
    };

    return { stream, controller };
  };

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('attempts to resume the stream when inactivity triggers a timeout before falling back to background completion', async () => {
    jest.useFakeTimers();

    const { service, streamingRuns, openAiClient } = createService();
    const heartbeat = jest.fn();
    streamingRuns.createHeartbeat.mockReturnValue(heartbeat);

    const finalJson = JSON.stringify({
      mp_name: 'MP',
      mp_address_1: 'Line1',
      mp_address_2: 'Line2',
      mp_city: 'City',
      mp_county: 'County',
      mp_postcode: 'PC',
      date: '2024-01-01',
      subject_line_html: '<p>Subject</p>',
      letter_content: '<p>Letter</p>',
      sender_name: 'Sender',
      sender_address_1: 'Addr1',
      sender_address_2: 'Addr2',
      sender_address_3: 'Addr3',
      sender_city: 'Sender City',
      sender_county: 'Sender County',
      sender_postcode: 'Sender PC',
      sender_phone: '123',
      references: [],
    });

    (service as any).normaliseLetterVerbosity = jest.fn().mockReturnValue('balanced');
    (service as any).normaliseLetterReasoningEffort = jest.fn().mockReturnValue('medium');
    (service as any).resolveLetterContext = jest.fn().mockResolvedValue({
      mpName: 'MP',
      mpAddress1: 'Line1',
      mpAddress2: 'Line2',
      mpCity: 'City',
      mpCounty: 'County',
      mpPostcode: 'PC',
      constituency: 'Constituency',
      senderName: 'Sender',
      senderAddress1: 'Addr1',
      senderAddress2: 'Addr2',
      senderAddress3: 'Addr3',
      senderCity: 'Sender City',
      senderCounty: 'Sender County',
      senderPostcode: 'Sender PC',
      senderTelephone: '123',
      today: '2024-01-01',
    });
    (service as any).buildLetterPrompt = jest.fn().mockReturnValue('prompt');
    (service as any).buildLetterResponseSchema = jest.fn().mockReturnValue({});
    (service as any).extractLetterPreview = jest.fn().mockReturnValue(null);
    (service as any).extractSubjectLinePreview = jest.fn().mockReturnValue(null);
    (service as any).extractOutputTextDelta = jest.fn().mockReturnValue(null);
    (service as any).persistLetterState = jest.fn().mockResolvedValue(undefined);
    (service as any).persistLetterResult = jest.fn().mockResolvedValue(undefined);
    (service as any).extractReferencesFromJson = jest.fn().mockReturnValue([]);
    (service as any).parseLetterResult = jest.fn().mockReturnValue({
      mp_name: 'MP',
      mp_address_1: 'Line1',
      mp_address_2: 'Line2',
      mp_city: 'City',
      mp_county: 'County',
      mp_postcode: 'PC',
      date: '2024-01-01',
      subject_line_html: '<p>Subject</p>',
      letter_content: '<p>Letter</p>',
      sender_name: 'Sender',
      sender_address_1: 'Addr1',
      sender_address_2: 'Addr2',
      sender_address_3: 'Addr3',
      sender_city: 'Sender City',
      sender_county: 'Sender County',
      sender_postcode: 'Sender PC',
      sender_phone: '123',
      references: [],
    });
    (service as any).mergeLetterResultWithContext = jest
      .fn()
      .mockImplementation((result: any) => result);
    (service as any).buildLetterDocumentHtml = jest.fn().mockReturnValue('<p>Final</p>');
    (service as any).toLetterCompletePayload = jest.fn().mockReturnValue({
      mpName: 'MP',
      mpAddress1: 'Line1',
      mpAddress2: 'Line2',
      mpCity: 'City',
      mpCounty: 'County',
      mpPostcode: 'PC',
      date: '2024-01-01',
      subjectLineHtml: '<p>Subject</p>',
      letterContent: '<p>Letter</p>',
      senderName: 'Sender',
      senderAddress1: 'Addr1',
      senderAddress2: 'Addr2',
      senderAddress3: 'Addr3',
      senderCity: 'Sender City',
      senderCounty: 'Sender County',
      senderPostcode: 'Sender PC',
      senderTelephone: '123',
      references: [],
      responseId: 'resp-1',
      tone: 'formal',
      rawJson: finalJson,
    });
    (service as any).waitForBackgroundResponseCompletion = jest.fn().mockResolvedValue({
      status: 'completed',
      output: [
        {
          content: [
            {
              type: 'output_text',
              text: finalJson,
            },
          ],
        },
      ],
    });
    (service as any).refundCredits = jest.fn().mockResolvedValue(undefined);

    const { stream, controller } = createTimeoutStream({
      responseId: 'resp-1',
      onAbort: () => {
        // no-op
      },
    });

    const responsesStreamMock = jest.fn()
      .mockReturnValueOnce(stream)
      .mockImplementationOnce(() => {
        throw new Error('resume failed');
      });

    openAiClient.getClient.mockResolvedValue({
      responses: {
        stream: responsesStreamMock,
      },
    });

    const subject = new ReplaySubject<any>();
    const emitted: any[] = [];
    subject.subscribe((value) => emitted.push(value));

    const run: any = {
      key: 'user-1::job-1',
      userId: 'user-1',
      jobId: 'job-1',
      tone: 'formal',
      subject,
      status: 'running',
      startedAt: Date.now(),
      cleanupTimer: null,
      promise: null,
      responseId: null,
      remainingCredits: null,
    };

    const baselineJob: any = {
      jobId: 'job-1',
      letterTone: 'formal',
      researchContent: 'Important research',
    };

    const executePromise = (service as any).executeLetterRun({
      run,
      userId: 'user-1',
      baselineJob,
      subject,
      researchContent: 'Important research',
    });

    const timeoutMs = (WritingDeskLetterService as any).LETTER_STREAM_INACTIVITY_TIMEOUT_MS as number;

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(timeoutMs + 1000);

    await executePromise;

    expect(responsesStreamMock).toHaveBeenCalledTimes(2);
    const resumeEventIndex = emitted.findIndex(
      (payload) => payload?.type === 'event' && payload?.event?.type === 'resume_attempt',
    );
    expect(resumeEventIndex).toBeGreaterThan(-1);
    expect((service as any).waitForBackgroundResponseCompletion).toHaveBeenCalledTimes(1);
    expect(controller.abort).toHaveBeenCalled();
  });

  it('propagates a timeout error from createStreamWithTimeout', async () => {
    jest.useFakeTimers();

    const { service } = createService();
    let rejectFn: ((error: Error) => void) | null = null;
    let timeoutInvocations = 0;

    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise<IteratorResult<string>>((_, reject) => {
            rejectFn = reject;
          }),
      }),
    };

    const generator = (service as any).createStreamWithTimeout(stream, 10, () => {
      timeoutInvocations += 1;
      rejectFn?.(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });

    const nextPromise = generator.next().catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(2000);

    const result = await nextPromise;
    expect(result).toMatchObject({ name: 'TimeoutError' });
    expect(timeoutInvocations).toBe(1);
  });
});
