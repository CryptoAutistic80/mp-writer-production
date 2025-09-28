import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserCreditsModule } from '../user-credits/user-credits.module';
import { WritingDeskJobsModule } from '../writing-desk-jobs/writing-desk-jobs.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [ConfigModule, UserCreditsModule, forwardRef(() => WritingDeskJobsModule)],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
