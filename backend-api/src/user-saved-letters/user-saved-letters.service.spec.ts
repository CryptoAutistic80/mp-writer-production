import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UserSavedLettersService } from './user-saved-letters.service';
import { EncryptionService } from '../crypto/encryption.service';
import { UserSavedLetter } from './schemas/user-saved-letter.schema';
import { ListSavedLettersDto } from './dto/list-saved-letters.dto';

const createFindChain = () => {
  const chain: any = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn(),
  };
  chain.sort.mockReturnValue(chain);
  chain.skip.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
};

describe('UserSavedLettersService', () => {
  let service: UserSavedLettersService;
  let model: any;
  let encryption: any;

  beforeEach(async () => {
    model = {
      find: jest.fn(),
      countDocuments: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    };

    encryption = {
      encryptObject: jest.fn((value) => value),
      decryptObjectWithRotation: jest.fn((value) => ({ payload: value, ciphertext: value, rotated: false })),
    };

    // Directly instantiate the service with mocks
    service = new UserSavedLettersService(model as any, encryption as any);
  });

  describe('findByDateRange', () => {
    it('filters by date range and applies pagination', async () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2024-02-01T00:00:00.000Z');
      const docs = [
        {
          _id: 'abc123',
          user: 'user-1',
          responseId: 'resp-1',
          letterHtmlCiphertext: '<p>Hello</p>',
          metadataCiphertext: {
            mpName: 'MP Name',
            letterContent: 'Letter body',
            references: ['ref1'],
            tone: 'friendly',
            rawJson: '{}',
          },
          referencesCiphertext: ['ref1'],
          rawJsonCiphertext: '{}',
          createdAt: new Date('2024-01-15T12:00:00.000Z'),
          updatedAt: new Date('2024-01-16T12:00:00.000Z'),
        },
      ];
      const findChain = createFindChain();
      findChain.exec.mockResolvedValue(docs);
      const countExec = jest.fn().mockResolvedValue(1);

      (model.find as jest.Mock).mockReturnValue(findChain);
      (model.countDocuments as jest.Mock).mockReturnValue({ exec: countExec });

      const options = Object.assign(new ListSavedLettersDto(), {
        from,
        to,
        page: 2,
        pageSize: 5,
      });

      const result = await service.findByDateRange('user-1', options);

      expect(model.find).toHaveBeenCalledWith({
        user: 'user-1',
        createdAt: { $gte: from, $lte: to },
      });
      expect(findChain.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(findChain.skip).toHaveBeenCalledWith(5);
      expect(findChain.limit).toHaveBeenCalledWith(5);
      expect(model.countDocuments).toHaveBeenCalledWith({
        user: 'user-1',
        createdAt: { $gte: from, $lte: to },
      });

      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'abc123',
        responseId: 'resp-1',
        letterHtml: '<p>Hello</p>',
        metadata: expect.objectContaining({
          mpName: 'MP Name',
          tone: 'friendly',
        }),
      });
    });

    it('returns empty results when nothing matches', async () => {
      const findChain = createFindChain();
      findChain.exec.mockResolvedValue([]);
      const countExec = jest.fn().mockResolvedValue(0);

      (model.find as jest.Mock).mockReturnValue(findChain);
      (model.countDocuments as jest.Mock).mockReturnValue({ exec: countExec });

      const result = await service.findByDateRange('user-2', Object.assign(new ListSavedLettersDto(), {}));

      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
    });

    it('uses default pagination values when not provided', async () => {
      const docs = [];
      const findChain = createFindChain();
      findChain.exec.mockResolvedValue(docs);
      const countExec = jest.fn().mockResolvedValue(0);

      (model.find as jest.Mock).mockReturnValue(findChain);
      (model.countDocuments as jest.Mock).mockReturnValue({ exec: countExec });

      await service.findByDateRange('user-3', {} as ListSavedLettersDto);

      expect(findChain.skip).toHaveBeenCalledWith(0);
      expect(findChain.limit).toHaveBeenCalledWith(20);
    });
  });

  it('refreshes ciphertext when rotation occurs during lookup', async () => {
    const doc = {
      _id: 'abc123',
      user: 'user-1',
      responseId: 'resp-1',
      letterHtmlCiphertext: 'oldHtml',
      metadataCiphertext: { references: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const findChain: any = {
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([doc]) }),
    };
    (model.find as jest.Mock).mockReturnValue(findChain);

    (encryption.decryptObjectWithRotation as jest.Mock).mockImplementation((value: any) => {
      if (value === 'oldHtml') {
        return { payload: '<p>Hello</p>', ciphertext: 'newHtml', rotated: true };
      }
      return { payload: value, ciphertext: value, rotated: false };
    });

    const result = await service.findByResponseIds('user-1', ['resp-1']);

    expect(result[0].letterHtml).toBe('<p>Hello</p>');
    expect(model.updateOne).toHaveBeenCalledWith({ _id: 'abc123' }, { $set: { letterHtmlCiphertext: 'newHtml' } });
  });
});
