import { ReplaySubject } from 'rxjs';

import { ActiveWritingDeskJobResource } from '../../../writing-desk-jobs/writing-desk-jobs.types';
import { StreamingRunState } from '../../../streaming-state/streaming-state.types';
import { WritingDeskResearchService, StreamInactivityTimeoutError } from './research.service';

describe('WritingDeskResearchService streaming recovery', () => {
  const buildService = () => {
    const config = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'OPENAI_API_KEY':
            return 'test-api-key';
          case 'OPENAI_DEEP_RESEARCH_MODEL':
            return 'o4-mini-deep-research';
          case 'OPENAI_DEEP_RESEARCH_ENABLE_WEB_SEARCH':
          case 'OPENAI_DEEP_RESEARCH_ENABLE_CODE_INTERPRETER':
            return 'false';
          case 'OPENAI_DEEP_RESEARCH_VECTOR_STORE_IDS':
          case 'OPENAI_DEEP_RESEARCH_WEB_SEARCH_CONTEXT_SIZE':
          case 'OPENAI_DEEP_RESEARCH_MAX_TOOL_CALLS':
          case 'OPENAI_DEEP_RESEARCH_REASONING_SUMMARY':
          case 'OPENAI_DEEP_RESEARCH_REASONING_EFFORT':
            return '';
          default:
            return undefined;
        }
      }),
    };

    const userCredits = {
      deductFromMine: jest.fn().mockResolvedValue({ credits: 9.3 }),
      addToMine: jest.fn().mockResolvedValue(undefined),
    };

    const writingDeskJobs = {
      getActiveJobForUser: jest.fn(),
      upsertActiveJob: jest.fn().mockResolvedValue(undefined),
    };

    const userMp = {
      getMine: jest.fn().mockResolvedValue(null),
    };

    const touchRun = jest.fn().mockResolvedValue(undefined);
    const clearRun = jest.fn().mockResolvedValue(undefined);
    const heartbeat = jest.fn();
    const streamingRuns = {
      createHeartbeat: jest.fn().mockReturnValue(heartbeat),
      touchRun,
      clearRun,
      registerRun: jest.fn().mockResolvedValue(undefined),
      updateRun: jest.fn().mockResolvedValue(undefined),
      getRun: jest.fn().mockResolvedValue(null),
    };

    const abort = jest.fn();

    const stalledStream = {
      controller: { abort },
      [Symbol.asyncIterator]() {
        let step = 0;
        return {
          next: () => {
            if (step === 0) {
              step += 1;
              return Promise.resolve({
                value: {
                  type: 'response.created',
                  response: { id: 'resp-123', output: [] },
                },
                done: false,
              });
            }
            if (step === 1) {
              step += 1;
              return new Promise(() => undefined);
            }
            return Promise.resolve({ value: undefined, done: true });
          },
          return: () => Promise.resolve({ done: true, value: undefined }),
        };
      },
    };

    const completionPayload = {
      type: 'response.completed',
      response: {
        id: 'resp-123',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: 'Recovered response text',
              },
            ],
          },
        ],
      },
    };

    const resumedStream = {
      [Symbol.asyncIterator]() {
        const events = [
          { type: 'response.in_progress' },
          { type: 'response.output_text.delta', delta: 'Recovered response text' },
          completionPayload,
        ];
        let index = 0;
        return {
          next: () => {
            if (index < events.length) {
              return Promise.resolve({ value: events[index++], done: false });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
          return: () => Promise.resolve({ done: true, value: undefined }),
        };
      },
    };

    const responses = {
      create: jest.fn().mockResolvedValue(stalledStream),
      stream: jest.fn().mockReturnValue(resumedStream),
      retrieve: jest.fn(),
    };

    const client = { responses };
    const openAiClient = {
      getClient: jest.fn().mockResolvedValue(client),
      markError: jest.fn(),
    };

    const service = new WritingDeskResearchService(
      config as any,
      userCredits as any,
      writingDeskJobs as any,
      userMp as any,
      streamingRuns as any,
      openAiClient as any,
    );

    const originalCreateStreamWithTimeout = (service as any).createStreamWithTimeout.bind(service);
    jest
      .spyOn(service as any, 'createStreamWithTimeout')
      .mockImplementation(function createStreamWithShortTimeout(stream: AsyncIterable<any>, _timeoutMs: number, onTimeout: () => void) {
        return originalCreateStreamWithTimeout(stream, 25, onTimeout);
      });

    return {
      service,
      config,
      userCredits,
      writingDeskJobs,
      userMp,
      streamingRuns,
      openAiClient,
      responses,
      stalledStream,
      resumedStream,
      abort,
    };
  };

  const createActiveJob = (
    overrides: Partial<ActiveWritingDeskJobResource> = {},
  ): ActiveWritingDeskJobResource => ({
    jobId: 'job-1',
    phase: 'initial',
    stepIndex: 0,
    followUpIndex: 0,
    form: { issueDescription: 'Issue' },
    followUpQuestions: [],
    followUpAnswers: [],
    notes: null,
    responseId: null,
    researchContent: null,
    researchResponseId: null,
    researchStatus: 'idle',
    letterStatus: 'idle',
    letterTone: null,
    letterResponseId: null,
    letterContent: null,
    letterReferences: [],
    letterJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  it('attempts to resume when the stream times out due to inactivity', async () => {
    const {
      service,
      responses,
      stalledStream,
    } = buildService();

    const subject = new ReplaySubject<any>();
    const emissions: any[] = [];
    subject.subscribe((payload) => emissions.push(payload));

    const run = {
      key: 'run-1',
      userId: 'user-1',
      jobId: 'job-1',
      subject,
      status: 'running' as const,
      startedAt: Date.now(),
      cleanupTimer: null as NodeJS.Timeout | null,
      promise: null as Promise<void> | null,
      responseId: null as string | null,
      sequence: 0,
    };

    const job = {
      jobId: 'job-1',
      phase: 'initial',
      stepIndex: 0,
      followUpIndex: 0,
      form: { issueDescription: 'Issue' },
      followUpQuestions: [],
      followUpAnswers: [],
      notes: null,
      responseId: null,
      researchContent: null,
      researchResponseId: null,
      researchStatus: 'idle',
      letterStatus: 'idle',
      letterTone: null,
      letterResponseId: null,
      letterContent: null,
      letterReferences: [],
      letterJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await (service as any).executeDeepResearchRun({ run, userId: 'user-1', job, subject });

    const resumeEvents = emissions.filter(
      (payload) => payload?.type === 'event' && payload?.event?.type === 'resume_attempt',
    );

    expect(responses.stream).toHaveBeenCalledTimes(1);
    expect(resumeEvents.length).toBeGreaterThanOrEqual(1);

    const timeoutErrors = emissions.filter((payload) => payload instanceof StreamInactivityTimeoutError);
    expect(timeoutErrors.length).toBe(0);

    const completeEvent = emissions.find((payload) => payload?.type === 'complete');
    expect(completeEvent).toBeDefined();

    expect(stalledStream.controller?.abort).toHaveBeenCalled();

    const sequenceNumbers = emissions
      .filter((payload) => payload && typeof payload.seq === 'number')
      .map((payload) => payload.seq as number);
    expect(sequenceNumbers.length).toBeGreaterThan(0);
    const sorted = [...sequenceNumbers].sort((a, b) => a - b);
    expect(sequenceNumbers).toEqual(sorted);
    expect(new Set(sequenceNumbers).size).toBe(sequenceNumbers.length);
  });

  describe('beginDeepResearchRun', () => {
    it('reuses an existing in-memory run when restart is not requested', async () => {
      const { service, writingDeskJobs, streamingRuns } = buildService();
      const job = createActiveJob();
      (writingDeskJobs.getActiveJobForUser as jest.Mock).mockResolvedValue(job);

      const existingRun = {
        key: 'user-1::job-1',
        userId: 'user-1',
        jobId: job.jobId,
        subject: new ReplaySubject<any>(),
        status: 'running' as const,
        startedAt: Date.now(),
        cleanupTimer: null as NodeJS.Timeout | null,
        promise: null as Promise<void> | null,
        responseId: null as string | null,
        sequence: 0,
      };

      ((service as any).researchRuns as Map<string, any>).set(existingRun.key, existingRun);

      const result = await (service as any).beginDeepResearchRun('user-1', job.jobId, {
        createIfMissing: false,
      });

      expect(result).toBe(existingRun);
      expect(streamingRuns.getRun).not.toHaveBeenCalled();
      expect(streamingRuns.registerRun).not.toHaveBeenCalled();
    });

    it('resurrects a persisted run before spawning a new one', async () => {
      const { service, writingDeskJobs, streamingRuns } = buildService();
      const job = createActiveJob();
      (writingDeskJobs.getActiveJobForUser as jest.Mock).mockResolvedValue(job);

      const persisted: StreamingRunState = {
        type: 'deep_research',
        runKey: 'user-1::job-1',
        userId: 'user-1',
        jobId: job.jobId,
        startedAt: Date.now(),
        status: 'running',
        responseId: 'resp-123',
        meta: {},
      };

      streamingRuns.getRun.mockResolvedValue(persisted);

      const resumedRun = {
        key: persisted.runKey,
        userId: persisted.userId,
        jobId: job.jobId,
        subject: new ReplaySubject<any>(),
        status: 'running' as const,
        startedAt: persisted.startedAt,
        cleanupTimer: null as NodeJS.Timeout | null,
        promise: null as Promise<void> | null,
        responseId: persisted.responseId,
        sequence: 0,
      };

      const resumeSpy = jest
        .spyOn(service as any, 'resumeDeepResearchRunFromState')
        .mockResolvedValue(resumedRun);

      try {
        const result = await (service as any).beginDeepResearchRun('user-1', job.jobId, {
          createIfMissing: false,
        });

        expect(result).toBe(resumedRun);
        expect(resumeSpy).toHaveBeenCalledWith({ persisted, userId: 'user-1', job });
        expect(streamingRuns.registerRun).not.toHaveBeenCalled();
      } finally {
        resumeSpy.mockRestore();
      }
    });
  });
});
