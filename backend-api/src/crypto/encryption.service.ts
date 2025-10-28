import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';

interface Envelope {
  version: string;
  iv: Buffer;
  tag: Buffer;
  data: Buffer;
}

// Envelope format: <version>.<ivB64>.<tagB64>.<dataB64>

@Injectable()
export class EncryptionService {
  private keyring?: Map<string, Buffer>;
  private primaryVersion?: string;

  constructor(private readonly config: ConfigService) {}

  static deriveKey(input: string): Buffer {
    // Accept base64, hex, or 32-byte utf8 keys
    const tryBase64 = () => {
      try {
        const b = Buffer.from(input, 'base64');
        return b.length === 32 ? b : null;
      } catch {
        return null;
      }
    };
    const tryHex = () => (/^[0-9a-fA-F]{64}$/.test(input) ? Buffer.from(input, 'hex') : null);
    const tryUtf8 = () => (Buffer.byteLength(input) === 32 ? Buffer.from(input, 'utf8') : null);

    const key = tryBase64() || tryHex() || tryUtf8();
    if (!key || key.length !== 32) {
      throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (base64, hex or utf8)');
    }
    return key;
  }

  private ensureKeyring(): { keyring: Map<string, Buffer>; primaryVersion: string } {
    if (this.keyring && this.primaryVersion) {
      return { keyring: this.keyring, primaryVersion: this.primaryVersion };
    }

    const rawPrimary = this.config.get<string>('DATA_ENCRYPTION_KEY_PRIMARY');
    const rawKeyring = this.config.get<string>('DATA_ENCRYPTION_KEYS');
    const rawMaster = this.config.get<string>('DATA_ENCRYPTION_KEY_MASTER');
    const rawVersions = this.config.get<string>('DATA_ENCRYPTION_KEY_VERSIONS');
    const legacyKey = this.config.get<string>('DATA_ENCRYPTION_KEY');

    const keyring = new Map<string, Buffer>();
    let primaryVersion: string | undefined;

    if (rawPrimary && rawKeyring) {
      const trimmedPrimary = rawPrimary.trim();
      if (!trimmedPrimary) {
        throw new Error('DATA_ENCRYPTION_KEY_PRIMARY must not be empty');
      }

      const entries = rawKeyring
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      if (entries.length === 0) {
        throw new Error('DATA_ENCRYPTION_KEYS must include at least one entry when using keyring mode');
      }

      for (const entry of entries) {
        const [version, rawKey] = entry.split(':');
        if (!version || !rawKey) {
          throw new Error(`DATA_ENCRYPTION_KEYS entry '${entry}' must be formatted as <version>:<key>`);
        }
        if (keyring.has(version)) {
          throw new Error(`Duplicate DATA_ENCRYPTION_KEYS entry for version '${version}'`);
        }

        const derived = EncryptionService.deriveKey(rawKey);
        keyring.set(version, derived);
      }

      if (!keyring.has(trimmedPrimary)) {
        throw new Error(`DATA_ENCRYPTION_KEYS is missing primary version '${trimmedPrimary}'`);
      }

      primaryVersion = trimmedPrimary;
    } else if (rawPrimary && rawMaster && rawVersions) {
      const trimmedPrimary = rawPrimary.trim();
      const master = EncryptionService.deriveKey(rawMaster);

      const versions = rawVersions
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      if (versions.length === 0) {
        throw new Error('DATA_ENCRYPTION_KEY_VERSIONS must list at least one version');
      }

      for (const version of versions) {
        if (keyring.has(version)) {
          throw new Error(`Duplicate DATA_ENCRYPTION_KEY_VERSIONS entry '${version}'`);
        }
        keyring.set(version, this.deriveVersionedKey(master, version));
      }

      if (!keyring.has(trimmedPrimary)) {
        throw new Error(`DATA_ENCRYPTION_KEY_VERSIONS is missing primary version '${trimmedPrimary}'`);
      }

      primaryVersion = trimmedPrimary;
    } else if (legacyKey) {
      const derived = EncryptionService.deriveKey(legacyKey);
      keyring.set('v1', derived);
      primaryVersion = 'v1';
    }

    if (!primaryVersion || keyring.size === 0) {
      throw new Error('DATA_ENCRYPTION_KEY configuration is missing');
    }

    this.keyring = keyring;
    this.primaryVersion = primaryVersion;
    return { keyring, primaryVersion };
  }

  private deriveVersionedKey(master: Buffer, version: string): Buffer {
    return crypto.createHmac('sha256', master).update(version).digest();
  }

  encryptObject(payload: unknown): string {
    const { keyring, primaryVersion } = this.ensureKeyring();
    const key = keyring.get(primaryVersion);
    if (!key) {
      throw new Error(`Encryption key for primary version '${primaryVersion}' not found`);
    }
    return this.encryptWithKey(payload, primaryVersion, key);
  }

  encryptWithPrimary(payload: unknown): string {
    return this.encryptObject(payload);
  }

  private encryptWithKey(payload: unknown, version: string, key: Buffer): string {
    const iv = crypto.randomBytes(12); // GCM recommended IV length
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${version}.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
  }

  private parseEnvelope(ciphertext: string): Envelope {
    if (!ciphertext) {
      throw new Error('No ciphertext');
    }

    const parts = ciphertext.split('.');
    if (parts.length !== 4) {
      throw new Error('Unsupported ciphertext format');
    }

    const [version, ivB64, tagB64, dataB64] = parts;
    if (!version) {
      throw new Error('Ciphertext is missing version');
    }

    return {
      version,
      iv: Buffer.from(ivB64, 'base64'),
      tag: Buffer.from(tagB64, 'base64'),
      data: Buffer.from(dataB64, 'base64'),
    };
  }

  private decryptEnvelope<T>(envelope: Envelope): T {
    const { keyring } = this.ensureKeyring();
    const key = keyring.get(envelope.version);
    if (!key) {
      throw new Error(`No encryption key registered for version '${envelope.version}'`);
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, envelope.iv);
    decipher.setAuthTag(envelope.tag);
    const dec = Buffer.concat([decipher.update(envelope.data), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as T;
  }

  decryptObject<T = any>(ciphertext: string): T {
    const envelope = this.parseEnvelope(ciphertext);
    return this.decryptEnvelope<T>(envelope);
  }

  decryptObjectWithRotation<T = any>(ciphertext: string): { payload: T; ciphertext: string; rotated: boolean } {
    const envelope = this.parseEnvelope(ciphertext);
    const payload = this.decryptEnvelope<T>(envelope);
    const { primaryVersion, keyring } = this.ensureKeyring();
    const rotated = envelope.version !== primaryVersion;

    if (!rotated) {
      return { payload, ciphertext, rotated: false };
    }

    const primaryKey = keyring.get(primaryVersion);
    if (!primaryKey) {
      throw new Error(`Encryption key for primary version '${primaryVersion}' not found`);
    }

    const refreshed = this.encryptWithKey(payload, primaryVersion, primaryKey);
    return { payload, ciphertext: refreshed, rotated: true };
  }
}
