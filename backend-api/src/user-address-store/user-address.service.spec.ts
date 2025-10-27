import { UserAddressService } from './user-address.service';
import { EncryptionService } from '../crypto/encryption.service';

describe('UserAddressService', () => {
  let model: any;
  let encryption: jest.Mocked<Pick<EncryptionService, 'encryptObject' | 'decryptObjectWithRotation'>>;
  let service: UserAddressService;

  beforeEach(() => {
    const updateExec = jest.fn().mockResolvedValue(undefined);
    model = {
      findOne: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: updateExec }),
      deleteOne: jest.fn(),
    };

    encryption = {
      encryptObject: jest.fn(),
      decryptObjectWithRotation: jest.fn(),
    } as any;

    service = new UserAddressService(model as any, encryption as any);
  });

  it('returns empty address when no document exists', async () => {
    (model.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const result = await service.getMine('user-1');

    expect(result).toEqual({ address: null });
    expect(encryption.decryptObjectWithRotation).not.toHaveBeenCalled();
  });

  it('rotates ciphertext when legacy data is read', async () => {
    const doc = {
      _id: 'abc123',
      ciphertext: 'oldCipher',
    };
    (model.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) });

    (encryption.decryptObjectWithRotation as jest.Mock).mockReturnValue({
      payload: {
        line1: '123 Street',
        postcode: 'ab12cd',
      },
      ciphertext: 'newCipher',
      rotated: true,
    });

    const result = await service.getMine('user-1');

    expect(result.address).toEqual({
      line1: '123 Street',
      line2: '',
      city: '',
      county: '',
      postcode: 'ab12cd',
      telephone: '',
    });
    expect(model.updateOne).toHaveBeenCalledWith({ _id: 'abc123' }, { $set: { ciphertext: 'newCipher' } });
  });
});
