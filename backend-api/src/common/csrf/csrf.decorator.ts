import { SetMetadata } from '@nestjs/common';
import { CSRF_BYPASS_KEY } from './csrf.metadata';

export const SkipCsrf = () => SetMetadata(CSRF_BYPASS_KEY, true);

