import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditLogService } from '../common/audit/audit-log.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly auditService: AuditLogService) {
    super();
  }

  /**
   * Override handleRequest to catch authentication failures and log them
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authContext = this.extractContext(request);

    // Authentication failed
    if (err || !user) {
      let reason = 'Unknown authentication failure';
      
      if (err) {
        reason = `Authentication error: ${err.message || String(err)}`;
      } else if (info) {
        if (info.message === 'jwt expired') {
          reason = 'JWT token expired';
        } else if (info.message === 'No auth token') {
          reason = 'No authentication token provided';
        } else if (info.message === 'jwt malformed') {
          reason = 'JWT token malformed';
        } else {
          reason = `Authentication failed: ${info.message || String(info)}`;
        }
      }

      this.auditService.logAuthFailure(authContext, reason, {
        endpoint: request.url,
        method: request.method,
      });
      
      return null;
    }

    // Authentication succeeded - log success
    this.auditService.logAuthSuccess(
      { ...authContext, userId: user.id },
      {
        endpoint: request.url,
        method: request.method,
      },
    );

    return user;
  }

  /**
   * Extract context information from request
   */
  private extractContext(request: any) {
    return {
      ip: request.ip || request.headers['x-forwarded-for']?.split(',')[0] || request.socket?.remoteAddress || 'unknown',
      endpoint: request.url,
    };
  }
}

