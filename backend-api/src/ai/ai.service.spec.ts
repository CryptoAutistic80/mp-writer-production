import { AiService } from './ai.service';
import { WritingDeskJobsService } from '../writing-desk-jobs/writing-desk-jobs.service';
import { UserCreditsService } from '../user-credits/user-credits.service';
import { ConfigService } from '@nestjs/config';
import { OpenAiClientService } from './openai/openai-client.service';
import { StreamingRunManager } from './streaming/streaming-run.manager';
import { WritingDeskLetterService } from './writing-desk/letter/letter.service';
import { StreamingRunState } from '../streaming-state/streaming-state.types';
import { WritingDeskResearchService } from './writing-desk/research/research.service';

describe('AiService', () => {
  const createService = ({
    configGet,
    userCredits,
    writingDeskJobs,
    streamingRuns,
    openAiClient,
    letterService,
    researchService,
  }: {
    configGet?: (key: string) => string | null | undefined;
    userCredits?: Partial<UserCreditsService>;
    writingDeskJobs?: Partial<WritingDeskJobsService>;
    streamingRuns?: Partial<StreamingRunManager>;
    openAiClient?: Partial<OpenAiClientService>;
    letterService?: Partial<WritingDeskLetterService>;
    researchService?: Partial<WritingDeskResearchService>;
  } = {}) => {
    const config = {
      get: jest.fn((key: string) => (configGet ? configGet(key) : null)),
    } as unknown as ConfigService;

    const credits = {
      deductFromMine: jest.fn().mockResolvedValue({ credits: 10 }),
      addToMine: jest.fn().mockResolvedValue(undefined),
      ...userCredits,
    } as unknown as UserCreditsService;

    const jobs = {
      getActiveJobForUser: jest.fn(),
      upsertActiveJob: jest.fn(),
      ...writingDeskJobs,
    } as unknown as WritingDeskJobsService;

    const streaming = {
      getInstanceId: jest.fn().mockReturnValue('test-instance'),
      listAllRuns: jest.fn().mockResolvedValue([]),
      findStaleRuns: jest.fn().mockResolvedValue([]),
      clearRun: jest.fn().mockResolvedValue(undefined),
      updateRun: jest.fn().mockResolvedValue(undefined),
      createHeartbeat: jest.fn(() => jest.fn()),
      registerRun: jest.fn().mockResolvedValue(undefined),
      touchRun: jest.fn().mockResolvedValue(undefined),
      getRun: jest.fn().mockResolvedValue(null),
      ...streamingRuns,
    } as unknown as StreamingRunManager;

    const openAi = {
      getClient: jest.fn(),
      handleError: jest.fn((error: unknown) => {
        throw error;
      }),
      recordSuccess: jest.fn(),
      markError: jest.fn(),
      ...openAiClient,
    } as unknown as OpenAiClientService;

    const letter = {
      streamLetter: jest.fn(),
      ensureLetterRun: jest.fn(),
      markRunCancelled: jest.fn().mockResolvedValue(true),
      cleanupStaleRuns: jest.fn().mockReturnValue(0),
      getRunTtlMs: jest.fn().mockReturnValue(5 * 60 * 1000),
      handleOrphanedRun: jest.fn().mockResolvedValue(undefined),
      ...letterService,
    } as unknown as WritingDeskLetterService;

    const research = {
      streamResearch: jest.fn(),
      ensureResearchRun: jest.fn(),
      cleanupStaleRuns: jest.fn().mockReturnValue(0),
      getRunTtlMs: jest.fn().mockReturnValue(5 * 60 * 1000),
      handleOrphanedRun: jest.fn().mockResolvedValue(undefined),
      markRunCancelled: jest.fn().mockResolvedValue(true),
      ...researchService,
    } as unknown as WritingDeskResearchService;

    const service = new AiService(
      config,
      credits,
      jobs,
      streaming,
      openAi,
      letter,
      research,
    );

    return {
      service,
      dependencies: {
        config,
        credits,
        jobs,
        streamingRuns: streaming,
        openAi,
        letter,
        research,
      },
    };
  };

  describe('streamWritingDeskLetter', () => {
    it('throws when userId is missing', () => {
      const { service } = createService();
      expect(() => service.streamWritingDeskLetter(null, {})).toThrowError('User account required');
    });

    it('delegates streaming to the letter service', () => {
      const stream = { subscribe: jest.fn() } as any;
      const { service, dependencies } = createService({
        letterService: {
          streamLetter: jest.fn().mockReturnValue(stream),
        },
      });

      const result = service.streamWritingDeskLetter('user-1', { jobId: 'job-123' });

      expect(dependencies.letter.streamLetter).toHaveBeenCalledWith('user-1', { jobId: 'job-123' });
      expect(result).toBe(stream);
    });
  });

  describe('ensureLetterRun', () => {
    it('delegates to the letter service', async () => {
      const { service, dependencies } = createService({
        letterService: {
          ensureLetterRun: jest
            .fn()
            .mockResolvedValue({ jobId: 'job-123', status: 'running' as const }),
        },
      });

      const result = await service.ensureLetterRun('user-1', 'job-123', {
        tone: 'formal',
        createIfMissing: true,
      });

      expect(dependencies.letter.ensureLetterRun).toHaveBeenCalledWith('user-1', 'job-123', {
        tone: 'formal',
        createIfMissing: true,
      });
      expect(result).toEqual({ jobId: 'job-123', status: 'running' });
    });
  });

  describe('streamWritingDeskDeepResearch', () => {
    it('throws when userId is missing', () => {
      const { service } = createService();
      expect(() => service.streamWritingDeskDeepResearch(null, {})).toThrowError('User account required');
    });

    it('delegates streaming to the research service', () => {
      const stream = { subscribe: jest.fn() } as any;
      const { service, dependencies } = createService({
        researchService: {
          streamResearch: jest.fn().mockReturnValue(stream),
        },
      });

      const result = service.streamWritingDeskDeepResearch('user-1', { jobId: 'job-123' });

      expect(dependencies.research.streamResearch).toHaveBeenCalledWith('user-1', {
        jobId: 'job-123',
        restart: undefined,
        createIfMissing: undefined,
      });
      expect(result).toBe(stream);
    });
  });

  describe('ensureDeepResearchRun', () => {
    it('delegates to the research service', async () => {
      const { service, dependencies } = createService({
        researchService: {
          ensureResearchRun: jest
            .fn()
            .mockResolvedValue({ jobId: 'job-456', status: 'completed' as const }),
        },
      });

      const result = await service.ensureDeepResearchRun('user-1', 'job-456', { restart: true });

      expect(dependencies.research.ensureResearchRun).toHaveBeenCalledWith('user-1', 'job-456', {
        restart: true,
      });
      expect(result).toEqual({ jobId: 'job-456', status: 'completed' });
    });
  });

  describe('recoverStaleStreamingRuns', () => {
    const createStaleRun = (overrides: Partial<StreamingRunState> = {}): StreamingRunState => ({
      type: 'deep_research',
      runKey: 'user-1::job-1',
      userId: 'user-1',
      jobId: 'job-1',
      status: 'running',
      startedAt: Date.now() - 1000,
      lastActivityAt: Date.now() - 1000,
      responseId: null,
      instanceId: 'other',
      meta: { charged: true },
      ...overrides,
    });

    it('delegates letter stale runs to the letter service', async () => {
      const letterRun = createStaleRun({ type: 'letter', runKey: 'user-2::job-2', userId: 'user-2' });
      const { service, dependencies } = createService({
        streamingRuns: {
          findStaleRuns: jest.fn().mockResolvedValue([letterRun]),
        },
        letterService: {
          handleOrphanedRun: jest.fn().mockResolvedValue(undefined),
        },
      });

      await service.recoverStaleStreamingRuns();

      expect(dependencies.letter.handleOrphanedRun).toHaveBeenCalledWith(letterRun);
      expect(dependencies.streamingRuns.clearRun).not.toHaveBeenCalledWith('letter', letterRun.runKey);
    });

    it('delegates deep research stale runs to the research service', async () => {
      const researchRun = createStaleRun();
      const { service, dependencies } = createService({
        streamingRuns: {
          findStaleRuns: jest.fn().mockResolvedValue([researchRun]),
        },
        researchService: {
          handleOrphanedRun: jest.fn().mockResolvedValue(undefined),
        },
      });

      await service.recoverStaleStreamingRuns();

      expect(dependencies.research.handleOrphanedRun).toHaveBeenCalledWith(researchRun);
      expect(dependencies.streamingRuns.clearRun).not.toHaveBeenCalledWith(
        'deep_research',
        researchRun.runKey,
      );
    });
  });
});
