import { Module, Global } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { RequestContextInterceptor } from '../interceptors/request-context.interceptor';

@Global()
@Module({
  providers: [AuditLogService, RequestContextInterceptor],
  exports: [AuditLogService],
})
export class AuditModule {}

