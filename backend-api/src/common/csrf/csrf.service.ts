import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

interface ParsedCsrfToken {
  version: string;
  timestampMs: number;
  nonce: string;
  signature: string;
  rawData: string;
}

@Injectable()
export class CsrfService {
  private static readonly TOKEN_VERSION = 'v1';
  private static readonly TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
  private static readonly MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutes clock skew tolerance

  private readonly secret: Buffer;

  constructor(private readonly config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret || secret.trim().length === 0) {
      throw new Error('JWT_SECRET must be configured before CsrfService can be used');
    }
    this.secret = Buffer.from(secret, 'utf8');
  }

  generateToken(): string {
    const timestamp = Date.now().toString();
    const nonce = randomBytes(18).toString('base64url');
    const data = `${timestamp}.${nonce}`;
    const signature = this.sign(data);

    return `${CsrfService.TOKEN_VERSION}.${data}.${signature}`;
  }

  getTokenTtlMs(): number {
    return CsrfService.TOKEN_TTL_MS;
  }

  validate(headerToken?: string | null, cookieToken?: string | null): void {
    if (!headerToken || typeof headerToken !== 'string') {
      throw new UnauthorizedException('Missing CSRF token header');
    }

    if (!cookieToken || typeof cookieToken !== 'string') {
      throw new UnauthorizedException('Missing CSRF cookie token');
    }

    if (!this.constantTimeEqual(headerToken, cookieToken)) {
      throw new UnauthorizedException('CSRF token mismatch');
    }

    const parsed = this.parseToken(headerToken);
    this.verifySignature(parsed);
    this.verifyTimestamp(parsed.timestampMs);
  }

  private parseToken(token: string): ParsedCsrfToken {
    const parts = token.split('.');
    if (parts.length !== 4) {
      throw new UnauthorizedException('Invalid CSRF token format');
    }

    const [version, timestamp, nonce, signature] = parts;
    if (version !== CsrfService.TOKEN_VERSION) {
      throw new UnauthorizedException('Unsupported CSRF token version');
    }

    const timestampMs = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(timestampMs)) {
      throw new UnauthorizedException('Invalid CSRF token timestamp');
    }

    const rawData = `${timestamp}.${nonce}`;

    return {
      version,
      timestampMs,
      nonce,
      signature,
      rawData,
    };
  }

  private verifySignature(parsed: ParsedCsrfToken): void {
    const expectedSignature = this.sign(parsed.rawData);

    if (!this.constantTimeEqual(expectedSignature, parsed.signature)) {
      throw new UnauthorizedException('Invalid CSRF token signature');
    }
  }

  private verifyTimestamp(timestampMs: number): void {
    const now = Date.now();

    if (timestampMs > now + CsrfService.MAX_FUTURE_SKEW_MS) {
      throw new UnauthorizedException('CSRF token timestamp is in the future');
    }

    if (now - timestampMs > CsrfService.TOKEN_TTL_MS) {
      throw new UnauthorizedException('CSRF token expired');
    }
  }

  private sign(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a, 'utf8');
    const bBuffer = Buffer.from(b, 'utf8');

    if (aBuffer.length !== bBuffer.length) {
      return false;
    }

    return timingSafeEqual(aBuffer, bBuffer);
  }
}

