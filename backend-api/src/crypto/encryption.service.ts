import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';

// Envelope format: v1.<ivB64>.<tagB64>.<dataB64>

@Injectable()
export class EncryptionService {
  private key?: Buffer;
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

  private getKey(): Buffer {
    if (this.key) return this.key;
    const raw = this.config.get<string>('DATA_ENCRYPTION_KEY');
    if (!raw) throw new Error('DATA_ENCRYPTION_KEY is required for encryption');
    this.key = EncryptionService.deriveKey(raw);
    return this.key;
  }

  encryptObject(payload: unknown): string {
    const key = this.getKey();
    const iv = crypto.randomBytes(12); // GCM recommended IV length
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
  }

  decryptObject<T = any>(ciphertext: string): T {
    const key = this.getKey();
    if (!ciphertext) throw new Error('No ciphertext');
    const parts = ciphertext.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Unsupported ciphertext format');
    }
    const [, ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const enc = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as T;
  }
}
