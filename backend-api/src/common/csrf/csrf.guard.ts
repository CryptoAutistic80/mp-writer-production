import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CsrfService } from './csrf.service';
import { AuditLogService, RequestContext } from '../audit/audit-log.service';
import { CSRF_BYPASS_KEY } from './csrf.metadata';

const CSRF_COOKIE_NAMES = ['__Host-csrf-token', 'mpw_csrf'] as const;
const CSRF_HEADER_NAME = 'x-csrf-token';

@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly LOGGER = new Logger('CsrfGuard');

  constructor(
    private readonly csrf: CsrfService,
    private readonly audit: AuditLogService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();

    const bypass =
      this.reflector.get<boolean>(CSRF_BYPASS_KEY, handler) ??
      this.reflector.get<boolean>(CSRF_BYPASS_KEY, controller) ??
      false;

    if (bypass) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (!request) {
      return true;
    }

    if (!this.requiresProtection(request.method)) {
      return true;
    }

    const headerToken = request.headers[CSRF_HEADER_NAME];
    const cookieResult = this.readCookie(request, CSRF_COOKIE_NAMES);

    const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;

    try {
      this.csrf.validate(headerValue, cookieResult?.value ?? null);
      return true;
    } catch (error) {
      this.handleFailure(request, error, Boolean(headerValue), cookieResult);

      if (error instanceof ForbiddenException) {
        throw error;
      }

      if (error instanceof Error) {
        throw new ForbiddenException(error.message);
      }

      throw new ForbiddenException('Invalid CSRF token');
    }
  }

  private requiresProtection(method?: string): boolean {
    if (!method) {
      return false;
    }

    const upper = method.toUpperCase();
    return upper === 'POST' || upper === 'PUT' || upper === 'PATCH' || upper === 'DELETE';
  }

  private readCookie(
    request: Request,
    names: readonly string[],
  ): { name: string; value: string } | null {
    const rawHeader = request.headers.cookie;
    if (!rawHeader) {
      return null;
    }

    const parts = rawHeader.split(';');
    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      if (names.includes(key)) {
        return {
          name: key,
          value: decodeURIComponent(value ?? ''),
        };
      }
    }

    return null;
  }

  private handleFailure(
    request: Request,
    error: unknown,
    hasHeader: boolean,
    cookieResult: { name: string; value: string } | null,
  ) {
    const message = error instanceof Error ? error.message : String(error);
    CsrfGuard.LOGGER.warn(`CSRF validation failed: ${message}`);

    const context: RequestContext = {
      endpoint: request.originalUrl,
      ip:
        request.ip ||
        (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim(),
      userId: (request as any)?.user?.id ?? (request as any)?.user?._id?.toString?.(),
    };

    this.audit.logCsrfFailure(context, message, {
      method: request.method,
      hasHeader,
      hasCookie: Boolean(cookieResult),
      cookieName: cookieResult?.name,
    });
  }
}

