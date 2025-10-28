import { EncryptionService } from './encryption.service';
import { ConfigService } from '@nestjs/config';

describe('EncryptionService keyring', () => {
  const createService = (env: Record<string, string | undefined>) => {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    return new EncryptionService(config);
  };

  it('encrypts with the primary version and rotates legacy ciphertexts', () => {
    const keyV1 = Buffer.alloc(32, 1).toString('hex');
    const keyV2 = Buffer.alloc(32, 2).toString('hex');

    const legacyService = createService({ DATA_ENCRYPTION_KEY: keyV1 });
    const ciphertextV1 = legacyService.encryptObject({ hello: 'world' });

    const keyringService = createService({
      DATA_ENCRYPTION_KEY_PRIMARY: 'v2',
      DATA_ENCRYPTION_KEYS: `v1:${keyV1},v2:${keyV2}`,
    });

    const latestCipher = keyringService.encryptObject({ hello: 'world' });
    expect(latestCipher.startsWith('v2.')).toBe(true);

    const result = keyringService.decryptObjectWithRotation<{ hello: string }>(ciphertextV1);
    expect(result.payload).toEqual({ hello: 'world' });
    expect(result.rotated).toBe(true);
    expect(result.ciphertext.startsWith('v2.')).toBe(true);
  });

  it('throws when keyring entries are invalid', () => {
    const invalidService = createService({
      DATA_ENCRYPTION_KEY_PRIMARY: 'v2',
      DATA_ENCRYPTION_KEYS: 'v1:not-a-real-key',
    });

    expect(() => invalidService.encryptObject('test')).toThrow(
      /DATA_ENCRYPTION_KEYS entry 'v1' invalid: DATA_ENCRYPTION_KEY must be 32 bytes/,
    );
  });

  it('throws when the primary version is missing from the keyring', () => {
    const missingPrimaryService = createService({
      DATA_ENCRYPTION_KEY_PRIMARY: 'v3',
      DATA_ENCRYPTION_KEYS: `v1:${Buffer.alloc(32, 3).toString('hex')}`,
    });

    expect(() => missingPrimaryService.encryptObject('test')).toThrow(
      /DATA_ENCRYPTION_KEYS is missing primary version 'v3'/,
    );
  });

  it('derives key versions from a master key and rotates automatically', () => {
    const master = Buffer.alloc(32, 7).toString('hex');
    const legacyService = createService({ DATA_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('hex') });
    const ciphertextV1 = legacyService.encryptObject({ foo: 'bar' });

    const derivedService = createService({
      DATA_ENCRYPTION_KEY_PRIMARY: 'v3',
      DATA_ENCRYPTION_KEY_MASTER: master,
      DATA_ENCRYPTION_KEY_VERSIONS: 'v1,v2,v3',
    });

    const freshCipher = derivedService.encryptObject({ foo: 'bar' });
    expect(freshCipher.startsWith('v3.')).toBe(true);

    const result = derivedService.decryptObjectWithRotation<{ foo: string }>(ciphertextV1);
    expect(result.payload).toEqual({ foo: 'bar' });
    expect(result.rotated).toBe(true);
    expect(result.ciphertext.startsWith('v3.')).toBe(true);
  });
});
