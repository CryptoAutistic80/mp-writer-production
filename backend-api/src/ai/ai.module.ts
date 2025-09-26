import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserCreditsModule } from '../user-credits/user-credits.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [ConfigModule, UserCreditsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
