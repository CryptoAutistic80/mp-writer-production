import { BadRequestException, ConflictException } from '@nestjs/common';
import { WritingDeskJobsController } from './writing-desk-jobs.controller';
import { WritingDeskJobsService } from './writing-desk-jobs.service';
import { AiService } from '../ai/ai.service';
import { ActiveWritingDeskJobResource } from './writing-desk-jobs.types';
import { StartDeepResearchDto } from './dto/start-deep-research.dto';
import { StartLetterDto } from './dto/start-letter.dto';

describe('WritingDeskJobsController', () => {
  const userId = 'user-123';
  const req = { user: { id: userId } };

  const createActiveJob = (
    overrides: Partial<ActiveWritingDeskJobResource> = {},
  ): ActiveWritingDeskJobResource => ({
    jobId: 'job-123',
    phase: 'initial',
    stepIndex: 0,
    followUpIndex: 0,
    form: { issueDescription: 'Example' },
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

  let controller: WritingDeskJobsController;
  let jobsService: jest.Mocked<WritingDeskJobsService>;
  let aiService: jest.Mocked<AiService>;

  beforeEach(() => {
    jobsService = {
      getActiveJobForUser: jest.fn(),
      upsertActiveJob: jest.fn(),
      deleteActiveJob: jest.fn(),
    } as unknown as jest.Mocked<WritingDeskJobsService>;

    aiService = {
      ensureDeepResearchRun: jest.fn(),
      ensureLetterRun: jest.fn(),
    } as unknown as jest.Mocked<AiService>;

    controller = new WritingDeskJobsController(jobsService, aiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startDeepResearch', () => {
    it('throws when no active job is available', async () => {
      jobsService.getActiveJobForUser.mockResolvedValue(null);

      await expect(controller.startDeepResearch(req, {} as StartDeepResearchDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(aiService.ensureDeepResearchRun).not.toHaveBeenCalled();
    });

    it('throws when the requested job differs from the active job', async () => {
      jobsService.getActiveJobForUser.mockResolvedValue(createActiveJob());

      await expect(
        controller.startDeepResearch(req, { jobId: 'other-job' } as StartDeepResearchDto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(aiService.ensureDeepResearchRun).not.toHaveBeenCalled();
    });

    it('restarts deep research when resume is false', async () => {
      const activeJob = createActiveJob();
      jobsService.getActiveJobForUser.mockResolvedValue(activeJob);

      const response = await controller.startDeepResearch(
        req,
        { jobId: activeJob.jobId } as StartDeepResearchDto,
      );

      expect(aiService.ensureDeepResearchRun).toHaveBeenCalledWith(userId, activeJob.jobId, { restart: true });
      expect(response).toEqual({
        jobId: activeJob.jobId,
        streamPath: `/api/ai/writing-desk/deep-research?jobId=${activeJob.jobId}`,
      });
    });

    it('resumes deep research when resume is true', async () => {
      const activeJob = createActiveJob();
      jobsService.getActiveJobForUser.mockResolvedValue(activeJob);

      const response = await controller.startDeepResearch(
        req,
        { jobId: activeJob.jobId, resume: true } as StartDeepResearchDto,
      );

      expect(aiService.ensureDeepResearchRun).toHaveBeenCalledWith(userId, activeJob.jobId, { createIfMissing: false });
      expect(response).toEqual({
        jobId: activeJob.jobId,
        streamPath: `/api/ai/writing-desk/deep-research?jobId=${activeJob.jobId}`,
      });
    });
  });

  describe('startLetter', () => {
    it('throws when no active job is available', async () => {
      jobsService.getActiveJobForUser.mockResolvedValue(null);

      await expect(controller.startLetter(req, {} as StartLetterDto)).rejects.toBeInstanceOf(BadRequestException);
      expect(aiService.ensureLetterRun).not.toHaveBeenCalled();
    });

    it('throws when the requested job differs from the active job', async () => {
      jobsService.getActiveJobForUser.mockResolvedValue(createActiveJob({ letterTone: 'formal' }));

      await expect(
        controller.startLetter(req, { jobId: 'other-job', tone: 'formal' } as StartLetterDto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(aiService.ensureLetterRun).not.toHaveBeenCalled();
    });

    it('requires a tone when none is present on the active job', async () => {
      jobsService.getActiveJobForUser.mockResolvedValue(createActiveJob({ letterTone: null }));

      await expect(controller.startLetter(req, {} as StartLetterDto)).rejects.toBeInstanceOf(BadRequestException);
      expect(aiService.ensureLetterRun).not.toHaveBeenCalled();
    });

    it('prevents resuming when no generation is in progress', async () => {
      const activeJob = createActiveJob({ letterTone: 'formal', letterStatus: 'idle' });
      jobsService.getActiveJobForUser.mockResolvedValue(activeJob);

      await expect(
        controller.startLetter(
          req,
          { jobId: activeJob.jobId, resume: true, tone: 'formal' } as StartLetterDto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(aiService.ensureLetterRun).not.toHaveBeenCalled();
    });

    it('starts a fresh letter generation run', async () => {
      const activeJob = createActiveJob({ letterTone: null, letterStatus: 'idle' });
      jobsService.getActiveJobForUser.mockResolvedValue(activeJob);

      const response = await controller.startLetter(
        req,
        { jobId: activeJob.jobId, tone: 'formal' } as StartLetterDto,
      );

      expect(aiService.ensureLetterRun).toHaveBeenCalledWith(userId, activeJob.jobId, {
        tone: 'formal',
        restart: true,
      });
      expect(response).toEqual({
        jobId: activeJob.jobId,
        streamPath: `/api/ai/writing-desk/letter?jobId=${activeJob.jobId}&tone=formal`,
      });
    });

    it('resumes letter generation when an in-progress run exists', async () => {
      const activeJob = createActiveJob({ letterTone: 'formal', letterStatus: 'generating' });
      jobsService.getActiveJobForUser.mockResolvedValue(activeJob);

      const response = await controller.startLetter(
        req,
        { jobId: activeJob.jobId, resume: true } as StartLetterDto,
      );

      expect(aiService.ensureLetterRun).toHaveBeenCalledWith(userId, activeJob.jobId, { createIfMissing: false });
      expect(response).toEqual({
        jobId: activeJob.jobId,
        streamPath: `/api/ai/writing-desk/letter?jobId=${activeJob.jobId}&tone=formal&resume=1`,
      });
    });
  });
});
