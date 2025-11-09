import { WritingDeskJobsService } from './writing-desk-jobs.service';
import { WritingDeskJobRecord } from './writing-desk-jobs.types';

describe('WritingDeskJobsService', () => {
  const buildService = () => {
    const repository = {
      findActiveByUserId: jest.fn().mockResolvedValue(null),
      upsertActiveJob: jest.fn(),
      deleteActiveJob: jest.fn(),
    };

    const encryption = {
      encryptObject: jest.fn((payload: unknown) => `enc(${JSON.stringify(payload)})`),
      decryptObject: jest.fn((ciphertext: string) => {
        const serialised = ciphertext.replace(/^enc\(/, '').replace(/\)$/u, '');
        return JSON.parse(serialised);
      }),
    };

    const service = new WritingDeskJobsService(repository as any, encryption as any);

    repository.upsertActiveJob.mockImplementation(
      async (userId: string, payload: Record<string, any>): Promise<WritingDeskJobRecord> => {
        const now = new Date();
        return {
          userId,
          jobId: payload.jobId,
          phase: payload.phase,
          stepIndex: payload.stepIndex,
          followUpIndex: payload.followUpIndex,
          followUpQuestionsCiphertext: payload.followUpQuestionsCiphertext,
          formCiphertext: payload.formCiphertext,
          followUpAnswersCiphertext: payload.followUpAnswersCiphertext,
          notesCiphertext: payload.notesCiphertext ?? null,
          researchContentCiphertext: payload.researchContentCiphertext ?? null,
          letterContentCiphertext: payload.letterContentCiphertext ?? null,
          letterReferencesCiphertext: payload.letterReferencesCiphertext ?? null,
          letterJsonCiphertext: payload.letterJsonCiphertext ?? null,
          responseId: payload.responseId ?? null,
          researchResponseId: payload.researchResponseId ?? null,
          researchStatus: payload.researchStatus,
          letterStatus: payload.letterStatus,
          letterTone: payload.letterTone ?? null,
          letterResponseId: payload.letterResponseId ?? null,
          createdAt: now,
          updatedAt: now,
        };
      },
    );

    return { service, repository, encryption };
  };

  it('encrypts research content and preserves the normalised state for resumed sessions', async () => {
    const { service, repository, encryption } = buildService();
    const dto = {
      jobId: '00000000-0000-0000-0000-000000000000',
      phase: 'initial',
      form: { issueDescription: 'Something happened' },
      stepIndex: 2,
      followUpIndex: 0,
      followUpQuestions: ['First question'],
      followUpAnswers: ['First answer'],
      researchContent: 'Important findings\r\nwith newline',
      researchResponseId: 'resp-456',
      researchStatus: 'completed',
      letterStatus: 'generating',
    };

    const result = await service.upsertActiveJob('user-1', dto as any);

    expect(repository.upsertActiveJob).toHaveBeenCalledTimes(1);
    const [, payload] = repository.upsertActiveJob.mock.calls[0];

    const expectedResearchContent = 'Important findings\nwith newline';
    const encryptCalls = encryption.encryptObject.mock.calls.map(([value]) => value);
    expect(encryptCalls).toContain(expectedResearchContent);
    expect(payload.researchContentCiphertext).toBe(`enc(${JSON.stringify(expectedResearchContent)})`);
    expect(payload.researchStatus).toBe('completed');

    expect(result.researchContent).toBe(expectedResearchContent);
    expect(result.researchStatus).toBe('completed');
    expect(result.form.issueDescription).toBe('Something happened');
    expect(result.followUpQuestions).toEqual(['First question']);
    expect(result.followUpAnswers).toEqual(['First answer']);
  });
});
