import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService, RequestContext } from '../audit/audit-log.service';

/**
 * Request context interceptor that captures user ID and IP address
 * for audit logging purposes throughout the request lifecycle
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const requestId = (request as any).__requestId || Math.random();
    
    // Extract context information
    const auditContext: RequestContext = {
      userId: request.user?.id || request.user?._id?.toString?.() || request.user?.userId,
      ip: request.ip || request.headers['x-forwarded-for']?.split(',')[0] || request.socket?.remoteAddress || 'unknown',
      endpoint: request.url,
    };

    // Store context for this request
    this.auditService.setContext(requestId, auditContext);

    return next.handle().pipe(
      tap({
        complete: () => {
          // Clean up context after request completes
          this.auditService.clearContext(requestId);
        },
      }),
    );
  }
}

