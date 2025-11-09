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

  describe('persist helpers', () => {
    it('persists research status using the minimal payload needed to preserve state', async () => {
      const { service, writingDeskJobs } = buildService();
      const job = createActiveJob();

      await (service as any).persistDeepResearchStatus('user-1', job, 'running');

      expect(writingDeskJobs.upsertActiveJob).toHaveBeenCalledWith('user-1', {
        jobId: job.jobId,
        phase: job.phase,
        stepIndex: job.stepIndex,
        followUpIndex: job.followUpIndex,
        form: job.form,
        followUpQuestions: job.followUpQuestions,
        followUpAnswers: job.followUpAnswers,
        researchStatus: 'running',
        letterStatus: job.letterStatus,
      });
    });

    it('persists research results without mutating unrelated fields', async () => {
      const { service, writingDeskJobs } = buildService();
      const job = createActiveJob({ letterStatus: 'completed', researchContent: 'Existing summary' });

      await (service as any).persistDeepResearchResult('user-1', job, {
        content: '   Finalised findings   ',
        responseId: 'resp-123',
        status: 'completed',
      });

      expect(writingDeskJobs.upsertActiveJob).toHaveBeenCalledWith('user-1', {
        jobId: job.jobId,
        phase: job.phase,
        stepIndex: job.stepIndex,
        followUpIndex: job.followUpIndex,
        form: job.form,
        followUpQuestions: job.followUpQuestions,
        followUpAnswers: job.followUpAnswers,
        researchContent: 'Finalised findings',
        researchResponseId: 'resp-123',
        researchStatus: 'completed',
        letterStatus: job.letterStatus,
      });
    });
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

  it('polls for background completion when the stream ends without a completion event', async () => {
    const { service, responses, streamingRuns } = buildService();

    const scheduleSpy = jest
      .spyOn(service as any, 'scheduleRunCleanup')
      .mockReturnValue(null as any);

    const subject = new ReplaySubject<any>();
    const emissions: any[] = [];
    subject.subscribe((payload) => emissions.push(payload));

    const earlyStream = {
      [Symbol.asyncIterator]() {
        const events = [
          { type: 'response.created', response: { id: 'resp-early', output: [] } },
          { type: 'response.in_progress' },
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

    responses.create.mockResolvedValue(earlyStream);

    const waitSpy = jest
      .spyOn(service as any, 'waitForBackgroundResponseCompletion')
      .mockResolvedValue({
        status: 'completed',
        id: 'resp-early',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: 'Recovered via background polling',
              },
            ],
          },
        ],
        usage: { total_tokens: 42 },
      });

    const persistSpy = jest.spyOn(service as any, 'persistDeepResearchResult');

    const run = {
      key: 'run-early',
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

    const job = createActiveJob();

    try {
      await (service as any).executeDeepResearchRun({ run, userId: 'user-1', job, subject });
    } finally {
      scheduleSpy.mockRestore();
    }

    expect(waitSpy).toHaveBeenCalledTimes(1);
    expect(waitSpy.mock.calls[0][1]).toBe('resp-early');

    expect(
      emissions.some((payload) => payload?.type === 'status' && payload?.status === 'background_polling'),
    ).toBe(true);

    const completeEvent = emissions.find((payload) => payload?.type === 'complete');
    expect(completeEvent).toMatchObject({
      content: 'Recovered via background polling',
      responseId: 'resp-early',
    });

    expect(persistSpy).toHaveBeenCalledWith(
      'user-1',
      job,
      expect.objectContaining({
        status: 'completed',
        responseId: 'resp-early',
        content: 'Recovered via background polling',
      }),
    );

    expect(streamingRuns.clearRun).toHaveBeenCalledWith('deep_research', run.key);

    waitSpy.mockRestore();
    persistSpy.mockRestore();
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

  describe('handleOrphanedRun', () => {
    it('refunds credits and clears streaming state for charged orphaned runs', async () => {
      const { service, writingDeskJobs, userCredits, streamingRuns } = buildService();
      const job = createActiveJob({ jobId: 'job-orphan', researchStatus: 'running' });
      (writingDeskJobs.getActiveJobForUser as jest.Mock).mockResolvedValue(job);

      const state: StreamingRunState = {
        type: 'deep_research',
        runKey: 'user-1::job-orphan',
        userId: 'user-1',
        jobId: 'job-orphan',
        startedAt: Date.now() - 1000,
        status: 'running',
        responseId: 'resp-123',
        meta: { charged: true },
      };

      await service.handleOrphanedRun(state);

      expect(userCredits.addToMine).toHaveBeenCalledWith('user-1', 0.7);
      expect(streamingRuns.clearRun).toHaveBeenCalledWith('deep_research', state.runKey);
      expect(writingDeskJobs.upsertActiveJob).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ researchStatus: 'error' }),
      );
    });
  });

  describe('scheduleRunCleanup', () => {
    it('evicts stale runs and clears the persisted streaming state', async () => {
      jest.useFakeTimers();
      try {
        const { service, streamingRuns } = buildService();

        const subject = new ReplaySubject<any>();
        const run = {
          key: 'user-1::job-cleanup',
          userId: 'user-1',
          jobId: 'job-cleanup',
          subject,
          status: 'completed' as const,
          startedAt: Date.now(),
          cleanupTimer: null as NodeJS.Timeout | null,
          promise: null as Promise<void> | null,
          responseId: 'resp-clean',
          sequence: 0,
        };

        ((service as any).researchRuns as Map<string, any>).set(run.key, run);

        const timer = (service as any).scheduleRunCleanup(run);
        expect(timer).toBeTruthy();
        expect(((service as any).researchRuns as Map<string, any>).has(run.key)).toBe(true);

        jest.advanceTimersByTime(service.getRunTtlMs());
        await Promise.resolve();

        expect(((service as any).researchRuns as Map<string, any>).has(run.key)).toBe(false);
        expect(streamingRuns.clearRun).toHaveBeenCalledWith('deep_research', run.key);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
