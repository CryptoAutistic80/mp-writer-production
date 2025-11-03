import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';
import { OpenAiClientService } from './openai/openai-client.service';
import { StreamingRunManager } from './streaming/streaming-run.manager';
import { WritingDeskLetterService } from './writing-desk/letter/letter.service';
import { StreamingRunState } from '../streaming-state/streaming-state.types';
import { WritingDeskResearchService } from './writing-desk/research/research.service';
import { WritingDeskFollowUpService } from './writing-desk/follow-up/follow-up.service';
import { AiTranscriptionService } from './transcription/transcription.service';

describe('AiService', () => {
  const createService = ({
    configGet,
    streamingRuns,
    openAiClient,
    letterService,
    researchService,
    followUpService,
    transcriptionService,
  }: {
    configGet?: (key: string) => string | null | undefined;
    streamingRuns?: Partial<StreamingRunManager>;
    openAiClient?: Partial<OpenAiClientService>;
    letterService?: Partial<WritingDeskLetterService>;
    researchService?: Partial<WritingDeskResearchService>;
    followUpService?: Partial<WritingDeskFollowUpService>;
    transcriptionService?: Partial<AiTranscriptionService>;
  } = {}) => {
    const config = {
      get: jest.fn((key: string) => (configGet ? configGet(key) : null)),
    } as unknown as ConfigService;

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

    const followUp = {
      generate: jest.fn(),
      record: jest.fn(),
      ...followUpService,
    } as unknown as WritingDeskFollowUpService;

    const transcription = {
      transcribeAudio: jest.fn(),
      streamTranscription: jest.fn(),
      ...transcriptionService,
    } as unknown as AiTranscriptionService;

    const service = new AiService(
      config,
      streaming,
      openAi,
      letter,
      research,
      followUp,
      transcription,
    );

    return {
      service,
      dependencies: {
        config,
        streamingRuns: streaming,
        openAi,
        letter,
        research,
        followUp,
        transcription,
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

  describe('generateWritingDeskFollowUps', () => {
    it('throws when userId is missing', async () => {
      const { service } = createService();
      await expect(service.generateWritingDeskFollowUps(null, { issueDescription: 'Test' } as any)).rejects.toThrow(
        'User account required',
      );
    });

    it('delegates to the follow-up service', async () => {
      const payload = { model: 'test', followUpQuestions: ['Q1'], notes: null } as any;
      const { service, dependencies } = createService({
        followUpService: {
          generate: jest.fn().mockResolvedValue(payload),
        },
      });

      const result = await service.generateWritingDeskFollowUps('user-1', { issueDescription: 'Help' } as any);

      expect(dependencies.followUp.generate).toHaveBeenCalledWith('user-1', { issueDescription: 'Help' });
      expect(result).toBe(payload);
    });
  });

  describe('recordWritingDeskFollowUps', () => {
    it('delegates to the follow-up service', async () => {
      const { service, dependencies } = createService({
        followUpService: {
          record: jest.fn().mockResolvedValue({ ok: true }),
        },
      });

      const dto = {
        issueDescription: 'Issue',
        followUpQuestions: ['Q1'],
        followUpAnswers: ['A1'],
      } as any;

      const result = await service.recordWritingDeskFollowUps(dto);

      expect(dependencies.followUp.record).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('transcribeAudio', () => {
    it('throws when userId is missing', async () => {
      const { service } = createService();
      await expect(service.transcribeAudio(null, { audioData: '' } as any)).rejects.toThrow('User account required');
    });

    it('delegates to the transcription service', async () => {
      const transcription = { text: 'hello' } as any;
      const { service, dependencies } = createService({
        transcriptionService: {
          transcribeAudio: jest.fn().mockResolvedValue(transcription),
        },
      });

      const result = await service.transcribeAudio('user-1', { audioData: 'data' } as any);

      expect(dependencies.transcription.transcribeAudio).toHaveBeenCalledWith('user-1', { audioData: 'data' });
      expect(result).toBe(transcription);
    });
  });

  describe('streamTranscription', () => {
    it('throws when userId is missing', () => {
      const { service } = createService();
      expect(() => service.streamTranscription(null, { audioData: '' } as any)).toThrowError('User account required');
    });

    it('delegates to the transcription service', () => {
      const stream = { subscribe: jest.fn() } as any;
      const { service, dependencies } = createService({
        transcriptionService: {
          streamTranscription: jest.fn().mockReturnValue(stream),
        },
      });

      const result = service.streamTranscription('user-1', { audioData: 'data' } as any);

      expect(dependencies.transcription.streamTranscription).toHaveBeenCalledWith('user-1', { audioData: 'data' });
      expect(result).toBe(stream);
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
