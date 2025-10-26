import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StreamingStateService } from './streaming-state.service';

@Module({
  imports: [ConfigModule],
  providers: [StreamingStateService],
  exports: [StreamingStateService],
})
export class StreamingStateModule {}
