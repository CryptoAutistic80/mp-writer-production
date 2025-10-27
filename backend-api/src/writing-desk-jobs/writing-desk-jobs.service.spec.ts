import { WritingDeskJobsService } from './writing-desk-jobs.service';
import { WritingDeskJobsRepository } from './writing-desk-jobs.repository';
import { EncryptionService } from '../crypto/encryption.service';
import { WritingDeskJobRecord } from './writing-desk-jobs.types';

describe('WritingDeskJobsService', () => {
  let repository: jest.Mocked<WritingDeskJobsRepository>;
  let encryption: jest.Mocked<Pick<EncryptionService, 'encryptObject' | 'decryptObjectWithRotation'>>;
  let service: WritingDeskJobsService;

  beforeEach(() => {
    repository = {
      findActiveByUserId: jest.fn(),
      upsertActiveJob: jest.fn(),
      deleteActiveJob: jest.fn(),
      updateCiphertexts: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WritingDeskJobsRepository>;

    encryption = {
      encryptObject: jest.fn(),
      decryptObjectWithRotation: jest.fn(),
    } as any;

    service = new WritingDeskJobsService(repository, encryption as any);
  });

  it('rotates ciphertext for active jobs when keys change', async () => {
    const record: WritingDeskJobRecord = {
      jobId: 'job-1',
      userId: 'user-1',
      phase: 'initial',
      stepIndex: 0,
      followUpIndex: 0,
      followUpQuestionsCiphertext: 'oldQuestions',
      formCiphertext: 'oldForm',
      followUpAnswersCiphertext: 'oldAnswers',
      responseId: null,
      researchResponseId: null,
      researchStatus: 'idle',
      letterStatus: 'idle',
      letterTone: null,
      letterResponseId: null,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    } as any;

    repository.findActiveByUserId.mockResolvedValue(record);

    (encryption.decryptObjectWithRotation as jest.Mock).mockImplementation((ciphertext: string) => {
      switch (ciphertext) {
        case 'oldForm':
          return { payload: { issueDescription: 'desc' }, ciphertext: 'newForm', rotated: true };
        case 'oldQuestions':
          return { payload: ['Question?'], ciphertext: 'newQuestions', rotated: true };
        case 'oldAnswers':
          return { payload: ['Answer'], ciphertext: 'oldAnswers', rotated: false };
        default:
          return { payload: null, ciphertext, rotated: false };
      }
    });

    const result = await service.getActiveJobForUser('user-1');

    expect(result).not.toBeNull();
    expect(result?.form.issueDescription).toBe('desc');
    expect(result?.followUpQuestions).toEqual(['Question?']);
    expect(repository.updateCiphertexts).toHaveBeenCalledWith('user-1', {
      formCiphertext: 'newForm',
      followUpQuestionsCiphertext: 'newQuestions',
    });
  });
});
