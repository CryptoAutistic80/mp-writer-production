import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly auditService: AuditLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // Determine status code and message
    let status: number;
    let message: string | object;

    if (exception instanceof HttpException) {
      // NestJS HTTP exceptions are safe to expose
      status = exception.getStatus();
      message = exception.getResponse();

      // Log permission denials for security audit
      if (exception instanceof ForbiddenException || exception instanceof UnauthorizedException) {
        const authContext = {
          userId: request.user?.id || request.user?._id?.toString?.() || request.user?.userId,
          ip: request.ip || request.headers['x-forwarded-for']?.split(',')[0] || request.socket?.remoteAddress || 'unknown',
          endpoint: request.url,
        };

        const reason = typeof message === 'string' ? message : (message as any)?.message || 'Access denied';
        this.auditService.logPermissionDenied(
          authContext,
          request.url,
          request.method,
          { httpStatus: status, reason },
        );
      }
    } else {
      // Unknown exceptions - sanitize completely
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = {
        statusCode: status,
        message: 'An unexpected error occurred. Please try again later.',
        timestamp: new Date().toISOString(),
        path: request.url,
      };

      // Log the full error details server-side
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Log all errors for debugging (but don't expose to client)
    this.logger.error(
      `HTTP ${status} Error on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json(message);
  }
}
