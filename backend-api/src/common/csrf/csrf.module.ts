import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './csrf.guard';
import { CSRF_BYPASS_KEY } from './csrf.metadata';

@Global()
@Module({
  providers: [CsrfService, CsrfGuard, Reflector],
  exports: [CsrfService, CsrfGuard],
})
export class CsrfModule {}

export { CSRF_BYPASS_KEY };

